var PD = require("probability-distributions");
var Promise = require("bluebird");

var bayesBandit = function (url, sequelize){
//   bandit<-function(x,n) {
//     p<-numeric(length)

//     for (i in 1:length) {
//      p[i]=rbeta(1, x[i]+1, n[i]-x[i]+1)
//     }
//     choice<-which(p==max(p))[1]

//     return(choice)
// }
//   x = successes to date
// n = trials to date for that variant
// length = number of variants

//   rbeta = The Beta function 
    var query = 'SELECT trial, count(Sharers.success_count > 0) as success, count(key) as trials from Sharers join Metadata on (Metadata.id = Sharers.trial) where Metadata.url = ? group by trial'

    return new Promise(function (resolve, reject){
      //TODO
      //1. memoize for config.X number of most popular urls the results of variants (we want to choose rbeta each time (but maybe pop them)
      //2. Milan wanted anything lower than (20*variants.length successes) we should just choose randomly
        sequelize
            .query(
              query,
              {
                replacements: [url],
                type: sequelize.QueryTypes.SELECT
              }
            )
            .then(
                function(variants){
                    if (! variants||variants.length == 0){return resolve(null)};
                    var rbetas = variants.map(function(i) {return [PD.rbeta(1, 1*i.success+1, 1*i.trials-1*i.success+1)[0], i.trial]}).sort().reverse()
                    resolve(rbetas[0][1])
                })
        })
}

module.exports = bayesBandit;
