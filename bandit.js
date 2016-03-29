var PD = require("probability-distributions");
var Promise = require("bluebird");

var bayesBandit = function(url, sequelize) {
//   bandit<-function(x,n) {
//     p<-numeric(length)

//     for (i in 1:length) {
//      p[i]=rbeta(1, x[i]+1, n[i]-x[i]+1)
//     }
//     choice<-which(p==max(p))[1]

//     return(choice)
//   }
//   x = successes to date
//   n = trials to date for that variant
//   length = number of variants
//   rbeta = The Beta function

    var query = ('SELECT trial, count(Sharers.success_count > 0) AS success, count(key) AS trials'
                 +' FROM Sharers'
                 +' JOIN Metadata on (Metadata.id = Sharers.trial)'
                 +' WHERE Metadata.url = ? GROUP BY trial')

    return new Promise(function(resolve, reject) {
      //TODO
      //1. memoize for config.X number of most popular urls the results of variants (we want to choose rbeta each time (but maybe pop them)
      sequelize
        .query(
          query,
          {
            replacements: [url],
            type: sequelize.QueryTypes.SELECT
          }
        )
        .then(function(variants){
          if (!variants || variants.length == 0) {
            resolve(null);
          };
          var totalSuccess = variants.reduce(function(total, variant) {
            return total + variant.success;
          }, 0);
          if (totalSuccess < 20 * variants.length) {
            var randomized = variants.sort(function() {
              return 0.5 - Math.random();
            });
            resolve(randomized[0].trial);
          } else {
            var rbetas = variants.map(function(variant) {
              return [
                PD.rbeta(
                  1,
                  (1*variant.success) + 1,
                  (1*variant.trials) - (1*variant.success) + 1
                )[0],
                variant.trial
              ];
            }).sort().reverse();
            resolve(rbetas[0][1]);
          }
        });
    });
};

module.exports = bayesBandit;
