var Promise = require("bluebird");

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

function SchemaActions(schema, sequelize, redis) {
  this.schema = schema
  this.sequelize = sequelize
  this.redis = redis
  this.dbActions = new DBSchemaActions(schema, sequelize)
  if (redis) {
    this.redisActions = new RedisSchemaActions(redis)
  } else {
    this.redisActions = new AlwaysColdRedisSchemaActions(redis)
  }
}

SchemaActions.prototype = {
  newEvent: function(abver, abid, isAction) {
    var redisActions = this.redisActions
    var dbActions = this.dbActions
    return new Promise(function (newEventResolve, newEventReject) {
      //console.log('new event', abver, abid, isAction)
      redisActions.newEvent(abver, abid, isAction)
        .then(newEventResolve,
              function(err) {
                console.log('NONCACHED metadata results', err)
                if (err.noMetadata) {
                  dbActions.newEvent(abver, abid, isAction, redisActions.loadMetadataIntoCache.bind(redisActions))
                    .then(newEventResolve, newEventReject)
                } else {
                  newEventReject(err)
                }
              })
    })
  },
  newShare: function(newsharer, abver) {
    var redisActions = this.redisActions
    var dbActions = this.dbActions
    //console.log('new share', newsharer, abver)
    return new Promise(function (newEventResolve, newEventReject) {
      redisActions.newShare(newsharer, abver)
        .then(newEventResolve,
              function(err) {
                dbActions.newShare(newsharer, abver)
                  .then(newEventResolve, newEventReject)
              })
    })
  },
  trialLookup: function(url, abver) {
    return this.dbActions.trialLookup(url, abver)
  },
  getSuccessfulShareCountsByTrial: function(url, successMetric) {
    var redisActions = this.redisActions
    var dbActions = this.dbActions
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
                              //console.log('cached Trials', cachedTrials)
                              trialCountResolve(cachedTrials)
                            }, function(err) {
                              //fallback to trials from db
                              trialCountResolve(trials)
                            })
                        }, function(err){
                          trialCountResolve(trials)
                        })
                    }, trialCountReject)
                } else {
                  trialCountReject(err)
                }
              })
    })
  }
}

function RedisSchemaActions(redis) {
  this.redis = redis
}

RedisSchemaActions.prototype = {
  loadMetadataIntoCache: function(metadata) {
    //console.log('loadmetadataintocache', metadata.toJSON())
    this.redis.set('METADATA_'+metadata.id, JSON.stringify(metadata.toJSON()), function(err, data){})
  },
  loadTrialDataIntoCache: function(url, trials, dbActions) {
    var r = this.redis
    return new Promise(function (resolve, reject) {
      var noZeros = true
      //console.log('TRIALS LIST', trials)
      var memberSuccessAbids = {}
      var memberDetails = {}
      var members = trials.map(function(t) {
        if (!t.trials || !t.success) {
          noZeros = false
        }
        memberDetails[t.trial] = {
          'success': [],
          'action': [],
          'total': []
        }
        return t.trial
      })
      if (!noZeros) {
        //return reject({hasZeros: true})
      }
      dbActions.getAllSharers(url).then(function(allSharers) {
        var commands = [
          ['sadd', 'URL_'+url, members]
        ]
        allSharers.forEach(function(s) {
          memberDetails[s.trial]['total'].push(s.abid)
          if (s.success) {
            memberDetails[s.trial]['success'].push(s.abid)
          }
          if (s.action) {
            memberDetails[s.trial]['action'].push(s.abid)
          }
        })
        for (var trial in memberDetails) {
          var mDetails = memberDetails[trial]
          commands.push(
            ['pfadd', 'sb_total_'+trial, mDetails.total],
            ['pfadd', 'sb_success_'+trial, mDetails.success],
            ['pfadd', 'sb_action_'+trial, mDetails.action]
          )
        }
        r.multi(commands).exec(function(err) {
          (err ? reject(err) : resolve())
        })
      })
    })
  },
  trialLookup: function(url, abver) {
    var r = this.redis
    return new Promise(function (resolve, reject) {
      r.get('METADATA_'+abver, function(err, data) {
        if (err) {
          return reject(err)
        } else if (data) {
          var parsedData = JSON.parse(data)
          if (parsedData.url == url) {
            return resolve(parsedData)
          }
        }
        resolve(null)
      })
    })
  },
  newShare: function(newsharer, abver) {
    var r = this.redis
    var event = 'success' //a new share is a click with 0 clicks
    return new Promise(function (newShareResolve, newShareReject) {
      var commands = [
        ['hincrby', ('PROCESS_'+event), (abver+'_'+abid), 0],
        ['pfadd', 'sb_total_'+abver, abid]
      ]
      r.multi(commands).exec(function(err){
        if (err) {
          newShareReject(err)
        } else {
          newShareResolve()
        }
      })
    })
  },
  newEvent: function(abver, abid, isAction) {
    var r = this.redis
    var event = (isAction ? 'action' : 'success')
    return new Promise(function (newEventResolve, newEventReject) {
      r.get('METADATA_'+abver, function(err, metadata) {
        if (err) {
          return newEventReject(err)
        } else {
          if (!metadata) {
            // this means we don't have the metadata url in cache,
            // so we can't incr them -- we'll have to fallback on the db
            return newEventReject({noMetadata: true})
          } else {
            // OK, now we can increment stuff!
            var metadataObj = JSON.parse(metadata)
            var url = metadataObj.url
            var commands = [
              // TODO: ISSUE: tests aren't assuming a new share request before the event
              // How do we insert a sharer represented from this url first?
              // Otherwise, will need to adjust test, at least
              // SOLUTION: we need a hyperloglog of abids for the TOTAL rather than just a count
              ['hincrby', ('PROCESS_'+event), (abver+'_'+abid), 1], //used to update DB
              ['pfadd', ('sb_'+event+'_'+abver), abid], //used for bandit algorithm
              ['pfadd', ('sb_total_'+abver), abid], //used for bandit algorithm
              ['expire', ('sb_'+event+'_'+abver), 86400], // 1 day
              ['expire', ('sb_total_'+abver), 86400] // 1 day
            ]
            r.multi(commands).exec(function(err, abver, abid, results) {
              if (err) {
                newEventReject(err)
              } else {
                //console.log('completed cached response', results, metadata)
                // not sure what value is useful here....
                newEventResolve(metadata)
              }
            })
          }
        }
      })
    })
  },
  getSuccessfulShareCountsByTrial: function(url, successMetric) {
    var r = this.redis
    return new Promise(function (trialCountResolve, trialCountReject) {
      r.smembers('URL_'+url, function(err, members) {
        if (err) {
          trialCountReject(err)
        } else if (!members.length) {
          trialCountReject({noMetadata: true})
        } else {
          var commands = []
          members.forEach(function(m_id) {
            commands.push(
              ['pfcount', ('sb_'+successMetric+'_'+m_id)],
              ['pfcount', ('sb_total_'+m_id)]
            )
          })
          //console.log('share trial commands', commands)
          r.multi(commands).exec(function(err, results) {
            //console.log('share trial results', err, results)
            if (err) {
              trialCountReject(err)
            } else {
              // Finally, the actual data!
              var returnValue = []
              for (var i=0,l=results.length;i<l;i=i+2) {
                returnValue.push({
                  trial: members[i/2],
                  success: results[i],
                  trials: results[i+1]
                })
              }
              //console.log('share trial return value', returnValue)
              trialCountResolve(returnValue)
            }
          })
        }
      })
    })
  },
  processCacheSaves: function() {
    // For each successMetric= {action,success}:
    // HGETALL SHAREBANDIT_PROCESS_<successMetric>
    // for all not 0
    //   send db update:
    //   HINCRBY SHAREBANDIT_PROCESS_<successMetric> <abver-abid> -<total_read>
    // for all 0:
    //   sort by abid, ascending
    //    HDEL all but top 10 keys
    // monitor size of TRIALS and remove when old?
  }
}

function AlwaysColdRedisSchemaActions(redis) {
  this.redis = redis
}

AlwaysColdRedisSchemaActions.prototype = {
  trialLookup: function(url, abver) {
    return Promise.reject({noMetadata: true})
  },
  newShare: function(newsharer, abver) {
    return Promise.reject({noMetadata: true})
  },
  newEvent: function(abver, abid, isAction) {
    return Promise.reject({noMetadata: true})
  },
  getSuccessfulShareCountsByTrial: function(url, successMetric) {
    return Promise.reject({noMetadata: true})
  },
  loadMetadataIntoCache: function(metadata) {
    return Promise.resolve()
  },
  loadTrialDataIntoCache: function(url, trials, dbActions) {
    return Promise.resolve()
  }
}


function DBSchemaActions(schema, sequelize) {
  this.schema = schema
  this.sequelize = sequelize
}

DBSchemaActions.prototype = {
  trialLookup: function(url, abver) {
    return this.schema.Metadata.findOne({
      'where': {'url': url, 'id': abver}
    })
  },
  newShare: function(newsharer, abver) {
    var schema = this.schema
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
        })
      });
    })
  },
  newEvent: function(abver, abid, isAction, metadataRetrievalCallback) {
    var schema = this.schema
    var sequelize = this.sequelize
    var EVENT_KEY = (isAction ? 'action_count' : 'success_count')
    return new Promise(function (newEventResolve, newEventReject) {
      schema.Metadata.findById(abver).then(function(metadata) {
        if (metadata) {
          if (metadataRetrievalCallback) {
            metadataRetrievalCallback(metadata)
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
                    })
                }, rejlog)
              });
            }).then(newEventResolve, newEventReject)
        } else {
          newEventReject('metadata not found ' + abver)
        }
      })
    })
  },
  getAllSharers: function(url) {
    var allSharersQuery = (
      'SELECT trial, key AS abid,'
        +' case when Sharers.success_count > 0 then 1 else 0 end AS success,'
        +' case when Sharers.action_count > 0 then 1 else 0 end AS action'
        +' FROM Sharers'
        +' JOIN Metadata on (Metadata.id = Sharers.trial)'
        +' WHERE Metadata.url = ?')
    return this.sequelize.query(
      allSharersQuery,
      {
        replacements: [url],
        type: this.sequelize.QueryTypes.SELECT
      }
    )
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
    )
  }
}

module.exports = function(schema, sequelize, redis) {
  if (redis) {
    return new SchemaActions(schema, sequelize, redis)
  } else {
    return new DBSchemaActions(schema, sequelize)
  }
}
