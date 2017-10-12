var axios = require('axios');
var config = require('../config/config.json');

// update facebook's cache with most recent metadata
function updateFacebookCache ( url ) {
	axios.post('https://graph.facebook.com', { id: url, scrape: true, access_token: config.fbAccessToken })
	  .then(function (response) {
	    console.log(response);
	  })
	  .catch(function (error) {
	    console.log(error);
	  });
}

module.exports = updateFacebookCache;