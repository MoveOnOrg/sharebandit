var PD = require("probability-distributions");
var Promise = require("bluebird");

var bayesBandit = function(url, successMetric, schemaActions) {
  // returns a Promise which will resolve to a 'trial' choice for the url

  // algorithm summary
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
  //      rbeta is basically doing some logarithmic/exponent stuff
  //      but really only about ~5 per rbeta call, so it'll be pretty fast
  
  return getUrlTrials(url, successMetric, chooseFromVariants, schemaActions);
}
var getUrlTrials = function(url, successMetric, func, schemaActions) {
  return new Promise(function(resolve, reject) {
    schemaActions.getSuccessfulShareCountsByTrial(url, successMetric).then(function(variants) {
      return func(variants, resolve, reject, 1);
    }, reject);
  });
};

function chooseFromVariants(variants, resolve, reject, numResults) {
  if (!variants || variants.length == 0) {
    reject('no variants');
  };
  var totalSuccess = variants.reduce(function(total, variant) {
    return total + variant.success;
  }, 0);
  var uncompletedVariants = variants.filter(function(v) {
    return v.success < 20;
  });
  if (uncompletedVariants.length
      && totalSuccess < 100 * variants.length) {
    var randomized = uncompletedVariants.sort(function() {
      return 0.5 - Math.random();
    });
    resolve(randomized[0].trial);
  } else {
    var rbetas = variants.map(function(variant) {
      var results = PD.rbeta(
          numResults || 1, //number of results wanted
          (1*variant.success) + 1,
          (1*variant.trials) - (1*variant.success) + 1
        );
      return [
        results[0],
        variant.trial,
        results
      ];
    }).sort().reverse();
    resolve(rbetas[0][1]);
  }
}

module.exports = {
  choose: bayesBandit,
  chooseFromVariants: chooseFromVariants,
  getUrlTrials: getUrlTrials
};
