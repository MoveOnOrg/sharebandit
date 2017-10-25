'use strict'
process.env.CONFIGFILE = process.env.CONFIGFILE || './config/lambda.json'
const awsServerlessExpress = require('aws-serverless-express')
const app = require('./index').app
const server = awsServerlessExpress.createServer(app)
exports.handler = (event, context, callback) => {
  if (!event.command) {
    return awsServerlessExpress.proxy(server, event, context)
  } else {
    console.log('running event', event)
    if (app.schemaActions && event.command in app.schemaActions) {
      app.schemaActions[event.command](function shouldContinue(timeEstimate){
        timeEstimate = timeEstimate || (1000 * 60 * 20) //default to 20 seconds
        return (context.getRemainingTimeInMillis() > timeEstimate)
      }, event).then(
        function(data) { callback(null, data) },
        function(err)  {
          console.error('event failed with error', err)
          callback(err, null)
        })
    }
  }
}
