const og=require('html-metadata');

function scrape (url) {
  url = "https://"+url; // assumes the protocol is https, because otherwise, it ain't worth a scrap
  return og(url);
}

module.exports=scrape;

