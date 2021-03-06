var Promise = require('bluebird');
var facebookCacheUpdater = require('./lib/updateFacebookCache.js');
/* Below are three objects:
 * DBSchemaActions: abstracted actions connecting through sequelize
 * RedisSchemaActions: abstracted actions for cached runtime
 * SchemaActions: The meta-object which negotiates between the two based on cache-results
 *
 * Also for debugging:
 *   AlwaysColdRedisSchemaActions which is a replacement for RedisSchemaActions
 *        but assumes the cache is cold every time. When this is the case, SchemaActions
 *        *should* function normally (and pass all the tests :-)
 */

function SchemaActions(config, schema, sequelize, redis) {
  this.config = config;
  this.schema = schema;
  this.sequelize = sequelize;
  this.redis = redis;
  this.dbActions = new DBSchemaActions(config, schema, sequelize);
  if (redis) {
    this.redisActions = new RedisSchemaActions(redis);
  } else {
    this.redisActions = new AlwaysColdRedisSchemaActions(redis);
  }
}

SchemaActions.prototype = {
  newEvent: function(abver, abid, isAction) {
    var redisActions = this.redisActions;
    var dbActions = this.dbActions;
    return new Promise(function (newEventResolve, newEventReject) {
      // console.log('new event', abver, abid, isAction)
      redisActions.newEvent(abver, abid, isAction)
        .then(newEventResolve,
          function(err) {
            // console.log('NONCACHED metadata results', err)
            if (err.noMetadata) {
              dbActions.newEvent(abver, abid, isAction, redisActions.loadMetadataIntoCache.bind(redisActions))
                .then(newEventResolve, newEventReject);
            } else {
              newEventReject(err);
            }
          });
    });
  },
  newShare: function(newsharer, abver) {
    var redisActions = this.redisActions;
    var dbActions = this.dbActions;
    // console.log('new share', newsharer, abver)
    return new Promise(function (newShareResolve, newShareReject) {
      redisActions.newShare(newsharer, abver)
        .then(newShareResolve,
          function(err) {
            dbActions.newShare(newsharer, abver)
              .then(newShareResolve, newShareReject);
          });
    });
  },
  trialLookup: function(url, abver) {
    var redisActions = this.redisActions;
    var dbActions = this.dbActions;
    return new Promise(function (trialLookupResolve, trialLookupReject) {
      redisActions.trialLookup(url, abver).then(function(data) {
        if (data) {
          trialLookupResolve(data);
        } else {
          dbActions.trialLookup(url, abver).then(function(dbData) {
            if (dbData) {
              redisActions.loadMetadataIntoCache(dbData);
            }
            trialLookupResolve(dbData);
          }, trialLookupReject);
        }
      }, trialLookupReject);
    });
  },
  getSuccessfulShareCountsByTrial: function(url, successMetric) {
    var redisActions = this.redisActions;
    var dbActions = this.dbActions;
    return new Promise(function (trialCountResolve, trialCountReject) {
      redisActions.getSuccessfulShareCountsByTrial(url, successMetric)
        .then(trialCountResolve,
          function(err) {
            if (err.noMetadata) {
              dbActions.getSuccessfulShareCountsByTrial(url, successMetric)
                .then(function(trials) {
                  // async dispatch here, that allows continuation below
                  redisActions.loadTrialDataIntoCache(url, trials, dbActions)
                    .then(function() {
                      redisActions.getSuccessfulShareCountsByTrial(url, successMetric)
                        .then(function(cachedTrials) {
                          // from cache after saving there
                          // console.log('cached Trials', cachedTrials)
                          trialCountResolve(cachedTrials);
                        }, function(err) {
                          //fallback to trials from db
                          trialCountResolve(trials);
                        });
                    }, function(err){
                      // fall-back to db results we just got
                      trialCountResolve(trials);
                    });
                }, trialCountReject);
            } else {
              trialCountReject(err);
            }
          });
    });
  },
  processData: function() {
    return this.redisActions.processData(this.dbActions);
  },
  processDataIncrementally: function(shouldContinue, options) {
    return this.redisActions.processDataIncrementally(this.dbActions, shouldContinue, options);
  },
  updateFacebookCache: function(shouldContinue, options) {
    return facebookCacheUpdater(this.config, this.schema, this.sequelize, options && options.interval, shouldContinue);
  },
  loadMetadataIntoCache: function(metadata) {
    return this.redisActions.loadMetadataIntoCache(metadata);
  }
};

function RedisSchemaActions(redis) {
  this.redis = redis;
  // This implements both:
  // * retrieving url/trial metadata and bandit-needed data in cache
  // * storing (for later sync) new shares and events
  // * caching metadata from database results for the corresponding function
  // With redis we organize the data into several namespaces:
  // 1. STRING: 'METADATA_<abver>' (i.e. metadata.id) value=(JSON of result)
  //    * Purpose is to return metadata results for facebook and api calls
  //    * Expires 1 hour after use, so that changes in trial metadata can be reflected reasonably quickly
  // 2. SET: 'URL_<url>' members=id(=abver)s in Metadata.id representing the different trials/treatments
  //    * Purpose for bandit algorithm and apis to gather all relevant abver info for a given url
  // 3. HYPERLOGLOG SET: 'sb_total_<abver>': all abids (i.e. sharer.key) for an abver/trial
  //    HYPERLOGLOG SET: 'sb_{success,action}_<abver>': all abids for a given success metric that had one or more event
  //    * Purpose is for bandit algorithm to track success vs. total counts for each abver
  //    * Expires 1 day after last use
  // 4. HASH: 'PROCESS_{success,action}': key='<abver>_<abid>' value=(count of unsync'd events for the abver-abid keypair
  //    * Purpose is to bulk process events rather than do writes incrementally to the database
  //    * Keys are cleared when value=0 (i.e. nothing to process after one full cycle)
}

RedisSchemaActions.prototype = {
  loadMetadataIntoCache: function(metadata) {
    // console.log('loadmetadataintocache', metadata.toJSON())
    var metadataKey = 'METADATA_'+metadata.id;
    this.redis.multi([
      ['set', metadataKey, JSON.stringify((metadata.toJSON ? metadata.toJSON() : metadata))],
      ['expire', metadataKey, 60*60] // 1 hour
    ]).exec(function(err, data) {
      if (err) {
        console.log('error saving metadata cache', metadata.id, err);
      }
    });
  },
  loadTrialDataIntoCache: function(url, trials, dbActions) {
    var r = this.redis;
    return new Promise(function (resolve, reject) {
      var noZeros = true;
      // console.log('TRIALS LIST', trials)
      var memberSuccessAbids = {};
      var memberDetails = {};
      var members = trials.map(function(t) {
        if (!t.trials || !t.success) {
          noZeros = false;
        }
        memberDetails[t.trial] = {
          'success': [],
          'action': [],
          'total': []
        };
        return t.trial;
      });
      if (!noZeros) {
        //return reject({hasZeros: true})
      }
      dbActions.getAllSharers(url).then(function(allSharers) {
        var commands = [
          ['sadd', 'URL_'+url, members]
        ];
        allSharers.forEach(function(s) {
          memberDetails[s.trial]['total'].push(s.abid);
          if (s.success) {
            memberDetails[s.trial]['success'].push(s.abid);
          }
          if (s.action) {
            memberDetails[s.trial]['action'].push(s.abid);
          }
        });
        for (var trial in memberDetails) {
          var mDetails = memberDetails[trial];
          commands.push(
            ['pfadd', 'sb_total_'+trial, mDetails.total],
            ['pfadd', 'sb_success_'+trial, mDetails.success],
            ['pfadd', 'sb_action_'+trial, mDetails.action]
          );
        }
        r.multi(commands).exec(function(err) {
          (err ? reject(err) : resolve());
        });
      });
    });
  },
  trialLookup: function(url, abver) {
    var r = this.redis;
    return new Promise(function (resolve, reject) {
      r.get('METADATA_'+abver, function(err, data) {
        if (err) {
          return reject(err);
        } else if (data) {
          var parsedData = JSON.parse(data);
          if (parsedData.url == url) {
            return resolve(parsedData);
          }
        }
        resolve(null);
      });
    });
  },
  newShare: function(newsharer, abver) {
    var r = this.redis;
    var event = 'success'; //a new share is a click with 0 clicks
    var abid = newsharer.key;
    return new Promise(function (newShareResolve, newShareReject) {
      var commands = [
        ['hincrby', ('PROCESS_'+event), (abver+'_'+abid), 0],
        ['pfadd', 'sb_total_'+abver, abid]
      ];
      r.multi(commands).exec(function(err){
        if (err) {
          newShareReject(err);
        } else {
          newShareResolve();
        }
      });
    });
  },
  newEvent: function(abver, abid, isAction) {
    var r = this.redis;
    var event = (isAction ? 'action' : 'success');
    return new Promise(function (newEventResolve, newEventReject) {
      r.get('METADATA_'+abver, function(err, metadata) {
        if (err) {
          return newEventReject(err);
        } else {
          if (!metadata) {
            // this means we don't have the metadata url in cache,
            // so we can't incr them -- we'll have to fallback on the db
            return newEventReject({noMetadata: true});
          } else {
            // OK, now we can increment stuff!
            var metadataObj = JSON.parse(metadata);
            var url = metadataObj.url;
            var commands = [
              ['hincrby', ('PROCESS_'+event), (abver+'_'+abid), 1], //used to update DB
              ['pfadd', ('sb_'+event+'_'+abver), abid], //used for bandit algorithm
              ['pfadd', ('sb_total_'+abver), abid], //used for bandit algorithm
              ['expire', ('sb_'+event+'_'+abver), 86400], // 1 day
              ['expire', ('sb_total_'+abver), 86400] // 1 day
            ];
            r.multi(commands).exec(function(err, abver, abid, results) {
              if (err) {
                newEventReject(err);
              } else {
                // console.log('completed cached response', results, metadata)
                // not sure what value is useful here....
                newEventResolve(metadata);
              }
            });
          }
        }
      });
    });
  },
  getSuccessfulShareCountsByTrial: function(url, successMetric) {
    var r = this.redis;
    return new Promise(function (trialCountResolve, trialCountReject) {
      r.smembers('URL_'+url, function(err, members) {
        if (err) {
          trialCountReject(err);
        } else if (!members.length) {
          trialCountReject({noMetadata: true});
        } else {
          var commands = [];
          members.forEach(function(m_id) {
            commands.push(
              ['pfcount', ('sb_'+successMetric+'_'+m_id)],
              ['pfcount', ('sb_total_'+m_id)]
            );
          });
          // console.log('share trial commands', commands)
          r.multi(commands).exec(function(err, results) {
            // console.log('share trial results', err, results)
            if (err) {
              trialCountReject(err);
            } else {
              // Finally, the actual data!
              var returnValue = [];
              for (var i=0,l=results.length;i<l;i=i+2) {
                returnValue.push({
                  trial: members[i/2],
                  success: results[i],
                  trials: results[i+1]
                });
              }
              // console.log('share trial return value', returnValue)
              trialCountResolve(returnValue);
            }
          });
        }
      });
    });
  },
  getProcessKeys: function(r, events, maxProcessCount, startOffset, callback) {
    r.multi(events.map(function(e) { return ['hgetall', 'PROCESS_'+e]; })).exec(function(err, shareEventsPerEvent) {
      if (err) {
        return callback(err, [], {});
      }
      var allShareEvents = {};
      shareEventsPerEvent.forEach(function(shareEvents, i) {
        // moves [{[abid_abid] => <metric count>}, ... ] to {[abid_abid] => {[<metric>]:<count>}
        for (var abver_abid in shareEvents) {
          if (!(abver_abid in allShareEvents)) {
            allShareEvents[abver_abid] = {};
          }
          allShareEvents[abver_abid][events[i]] = shareEvents[abver_abid];
        }
      });
      // console.log('cached events to process', err, allShareEvents)
      var baseSlice = Object.keys(allShareEvents);
      baseSlice.sort(function(a,b) {
        // reverse sorts by total of both event successMetrics
        var aTotal = (allShareEvents[a].action || 0) + (allShareEvents[a].success || 0);
        var bTotal = (allShareEvents[b].action || 0) + (allShareEvents[b].success || 0);
        return bTotal - aTotal;
      });
      callback(err, baseSlice, allShareEvents);
    });
  },
  processDataIncrementally: function(dbActions, shouldContinue, options) {
    // This runs processData in batches of 100 to avoid over-large sql commands
    var self = this;
    var maxProcessCount = 100;
    return new Promise(function (processDataResolve, processDataReject) {

      var anotherRound = function(data) {
        // console.log('processing data', data.startOffset, (data.allKeys || []).length, Object.keys(data || {}));
        var newOffset = data.startOffset + maxProcessCount;
        if (!shouldContinue(1000 * 60 * 20) // give ourselves 20 seconds, at least
            || (options && options.onlyOnce && newOffset >= (data.allKeys || []).length)
        ) {
          return processDataResolve();
        } else if (newOffset >= data.allKeys.length) {
          setTimeout(function() { // wait 2 seconds before starting from scratch
            self.processData(dbActions, null, null, 100, 0)
              .then(anotherRound, processDataReject);
          }, 2000);
        } else {
          self.processData(dbActions, data.allKeys, data.allShareEvents, maxProcessCount, newOffset)
            .then(anotherRound, processDataReject);
        }
      };

      self.processData(dbActions, null, null, 100, 0)
        .then(anotherRound, processDataReject);
    });
  },
  processData: function(dbActions, sliceOfKeys, allShareEvents, maxProcessCount, startOffset) {
    var self = this;
    var r = this.redis;
    var events = ['success', 'action'];
    var dbRecords = {};
    var completed = 0;
    return new Promise(function (processDataResolve, processDataReject) {
      // For each successMetric....
      // 1. get all PROCESS_{success,action} keys
      // 2. find out which ones already have sharer records in the db
      // 3. then create new ones for non-existing records, and update counts for existing ones
      var getProcessKeys = function(r, events, maxProcessCount, startOffset, func){
        return func(null, sliceOfKeys, allShareEvents);
      };
      if (!sliceOfKeys) {
        getProcessKeys = self.getProcessKeys;
      }
      getProcessKeys(r, events, maxProcessCount, startOffset, function(err, baseSlice, allShareEvents) {
        // console.log('DEBUG keys', Object.keys(allShareEvents));
        var rv = {'allKeys': baseSlice,
          'allShareEvents': allShareEvents,
          'startOffset': startOffset || 0,
          'processCount': maxProcessCount};
        if (err) {
          return processDataReject(err);
        }
        var keySliceToProcess = baseSlice;
        if (maxProcessCount) {
          keySliceToProcess = baseSlice.slice(startOffset || 0, maxProcessCount);
        }
        dbActions.schema.Sharer.findAll({
          attributes: ['id', 'key', 'trial'],
          where: {
            key: {
              $in: keySliceToProcess.map(function(redisKey){ return redisKey.split('_')[1]; }) //abid
            }
          }
        }).then(function(dbSharers) {
          // console.log('db results to match cache', dbSharers);
          dbSharers.forEach(function(dbShare) {
            dbRecords[dbShare.dataValues.trial + '_' + dbShare.dataValues.key] = dbShare.dataValues.id;
          });
          dbActions.sequelize.transaction(function(t) {
            // console.log('DEBUG transactioning: keys:', keySliceToProcess.length);
            return new Promise(function (completeTransaction, rollbackTransaction) {
              var newToDb = {};
              var updateDb = {};
              for (var i=0,l=keySliceToProcess.length; i<l; i++) {
                var abver_abid = keySliceToProcess[i];
                var split_abver_abid = abver_abid.split('_');
                events.forEach(function(event) {
                  var updateCount = allShareEvents[abver_abid][event];
                  if (abver_abid in dbRecords) {
                    var updateKey = event + '_' + dbRecords[abver_abid];
                    if (updateCount && parseInt(updateCount)) {
                      updateDb[updateKey] = parseInt(updateCount);
                    }
                  } else {
                    if (!(abver_abid in newToDb)) {
                      newToDb[abver_abid] = { 'trial': split_abver_abid[0], 'key': split_abver_abid[1] };
                    }
                    newToDb[abver_abid][event+'_count'] = updateCount;
                  }
                });
              }
              for (var updateKey in updateDb) {
                var tokens = updateKey.split('_');
                var event = tokens[0];
                var shareId = tokens[1];
                var updateCount = updateDb[updateKey];
                dbActions.sequelize.query('UPDATE sharers SET '+event+'_count = '+event+'_count + ? WHERE id = ?', {
                  replacements: [updateCount, shareId],
                  transaction: t
                }).then(function() {}, function(err) {
                  console.log('ERROR update raw sql', err);
                });
              }
              var newSharers = Object.keys(newToDb).map(function(s) {return newToDb[s]; });
              // console.log('DEBUG new Sharers', newSharers.length);

              var updateMetaDataFromSharers = function () {
                var abvers = {}; // unique list of abver (i.e. metadata.ids) we should update
                keySliceToProcess.forEach(function(abver_abid) {
                  abvers[ abver_abid.split('_')[0] ] = 1;
                });
                dbActions.sequelize.query('UPDATE metadata SET '
                      + 'action_count = (SELECT SUM(action_count) FROM sharers WHERE trial = metadata.id),'
                      + 'success_count = (SELECT SUM(success_count) FROM sharers WHERE trial = metadata.id),'
                      + 'trial_count = (SELECT COUNT(*) FROM sharers WHERE trial = metadata.id)'
                      + ' WHERE id IN (?)', {
                  replacements: [Object.keys(abvers)],
                  transaction: t
                }).then(function(res) {
                  // console.log('update query results', res);
                  completeTransaction();
                }, function(err) {
                  console.log('ERROR update raw sql', err);
                  rollbackTransaction(err);
                });
              };

              if (newSharers.length) {
                dbActions.schema.Sharer.bulkCreate(newSharers,
                  {transaction: t}).then(function(success) {
                  updateMetaDataFromSharers();
                }, function(err){
                  console.log('bulk create error', err);
                  rollbackTransaction(err);
                });
              } else {
                updateMetaDataFromSharers();
              }
            });
          }).then(function(transactionComplete) {
            // now that we saved to the db, we can decrement/clear the process values
            var commands = [];
            keySliceToProcess.forEach(function(abver_abid) {
              events.forEach(function(event) {
                if (!allShareEvents[abver_abid][event]) {
                  return; // skip event-(abver-abid) pair, since no key exists
                }
                var updateCount = parseInt(allShareEvents[abver_abid][event]);
                // console.log('DEBUG UPDATING KEYS', abver_abid, updateCount)
                if (updateCount) {
                  commands.push(['hincrby', 'PROCESS_'+event, abver_abid, -updateCount]);
                } else { // either 0 or null, so we should purge the key
                  // TODO: possibly sort by abver asc and just drop the top-10 or so
                  //       That way older abvers will cycle out faster
                  commands.push(['hdel', 'PROCESS_'+event, abver_abid]);
                }
              });
            });
            r.multi(commands).exec(function(err) {
              if (err) {
                console.log('Failed to resync cache to db!'
                            + 'At this point, your db and cache are out of sync'
                            + 'and future syncs will inflate rates. Error:', err);
                // re-trying, etc would only make this worse :-(
                // so will fall through to resolving
              }
              if (++completed) {
                processDataResolve(rv);
              }
            });
          }, function(transactionErr) {
            console.log('transaction error', transactionErr);
            processDataReject(transactionErr);
          });
        }, function(dbSharerSelectErr) {
          console.log('db error', dbSharerSelectErr);
          processDataReject(dbSharerSelectErr);
        });
      });
    });
  }
};

function AlwaysColdRedisSchemaActions(redis) {
  this.redis = redis;
}

AlwaysColdRedisSchemaActions.prototype = {
  trialLookup: function(url, abver) {
    return Promise.reject({noMetadata: true});
  },
  newShare: function(newsharer, abver) {
    return Promise.reject({noMetadata: true});
  },
  newEvent: function(abver, abid, isAction) {
    return Promise.reject({noMetadata: true});
  },
  getSuccessfulShareCountsByTrial: function(url, successMetric) {
    return Promise.reject({noMetadata: true});
  },
  loadMetadataIntoCache: function(metadata) {
    return Promise.resolve();
  },
  loadTrialDataIntoCache: function(url, trials, dbActions) {
    return Promise.resolve();
  }
};


function DBSchemaActions(config, schema, sequelize) {
  this.config = config;
  this.schema = schema;
  this.sequelize = sequelize;
}

DBSchemaActions.prototype = {
  trialLookup: function(url, abver) {
    return this.schema.Metadata.findOne({
      'where': {'url': url, 'id': abver}
    });
  },
  newShare: function(newsharer, abver) {
    var schema = this.schema;
    return this.sequelize.transaction(function(t) {
      //ideally, we'd pass a Promise.all and serialize this, for easier readability, if nothing else
      // but that really f---s with the transaction, so better to do callback hell here
      return new Promise(function (resolve, reject) {
        schema.Sharer.findOrCreate({'where': newsharer}).spread(function(sharer, created) {
          if (created) {
            schema.Metadata.findById(abver).then(function(metadata) {
              metadata.increment('trial_count').then(resolve, reject);
            });
          } else {
            resolve();
          }
        });
      });
    });
  },
  newEvent: function(abver, abid, isAction, metadataRetrievalCallback) {
    var schema = this.schema;
    var sequelize = this.sequelize;
    var EVENT_KEY = (isAction ? 'action_count' : 'success_count');
    return new Promise(function (newEventResolve, newEventReject) {
      schema.Metadata.findById(abver).then(function(metadata) {
        if (metadata) {
          if (metadataRetrievalCallback) {
            metadataRetrievalCallback(metadata);
          }
          sequelize.transaction(/*{
                                  deferrable: Sequelize.Deferrable.SET_IMMEDIATE,
                                  isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE
                                  },*/
            function(t) {
              //ideally, we'd pass a Promise.all and serialize this, for easier readability, if nothing else
              // but that really f---s with the transaction, so better to do callback hell here
              return new Promise(function (resolve, reject) {
                var rejlog = function() {
                  //console.log('rejected!');
                  reject();
                };
                //1.
                metadata.increment(EVENT_KEY, {transaction: t}).then(function() {
                  //2.
                  schema.Sharer.findOrCreate({where:{'key': abid,
                    'trial': abver},
                  transaction: t
                  })
                    .spread(function(sharer, created) {
                      //3.
                      sharer.increment(EVENT_KEY, {transaction: t}).then(
                        function() {
                          //4.
                          schema.Bandit.create({'trial': abver,
                            'action': !!isAction}, {transaction: t}).then(resolve, rejlog);
                        }, rejlog);
                    });
                }, rejlog);
              });
            }).then(function(data) {
            newEventResolve(data);
          }, newEventReject);
        } else {
          newEventReject('metadata not found ' + abver);
        }
      });
    });
  },
  getAllSharers: function(url) {
    var allSharersQuery = (
      'SELECT trial, key AS abid,'
        +' case when Sharers.success_count > 0 then 1 else 0 end AS success,'
        +' case when Sharers.action_count > 0 then 1 else 0 end AS action'
        +' FROM Sharers'
        +' JOIN Metadata on (Metadata.id = Sharers.trial)'
        +' WHERE Metadata.url = ?');
    return this.sequelize.query(
      allSharersQuery,
      {
        replacements: [url],
        type: this.sequelize.QueryTypes.SELECT
      }
    );
  },
  getSuccessfulShareCountsByTrial: function(url, successMetric) {
    var query = ('SELECT trial, sum(case when Sharers.{{success_field}}_count > 0 then 1 else 0 end) AS success, count(key) AS trials'
                 +' FROM Sharers'
                 +' JOIN Metadata on (Metadata.id = Sharers.trial)'
                 +' WHERE Metadata.url = ? GROUP BY trial')
      .replace('{{success_field}}',
        ((successMetric == 'action') ? 'action' : 'success')
      );

    return this.sequelize.query(
      query,
      {
        replacements: [url],
        type: this.sequelize.QueryTypes.SELECT
      }
    );
  },
  processData: function() {
    return Promise.resolve();
  },
  processDataIncrementally: function(shouldContinue) {
    return Promise.resolve();
  },
  updateFacebookCache: function(shouldContinue, options) {
    return facebookCacheUpdater(this.config, this.schema, this.sequelize, options && options.interval, shouldContinue);
  },
  loadMetadataIntoCache: function(metadata) {
    return Promise.resolve();
  }
};

module.exports = function(config, schema, sequelize, redis) {
  if (redis) {
    return new SchemaActions(config, schema, sequelize, redis);
  } else {
    return new DBSchemaActions(config, schema, sequelize);
  }
};
