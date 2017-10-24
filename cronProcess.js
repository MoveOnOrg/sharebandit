'use strict'

const fullApp = require('./index')
const start = new Date()
const timeout = 1000*60*5 // 5 minutes

fullApp.app.schemaActions.processDataIncrementally(function(){ return ((new Date() - start) > timeout) })
