var express = require('express')
var bodyParser = require('body-parser')
var LpServer = require('./')

var lpServer = new LpServer()

express()
  .use(bodyParser.json())
  .post('/lpio', function(req, res, next) {
    var channel = lpServer.open(req.body)

    channel.once('close', function(data) {
      res.json(data)
    })
    channel.once('error', console.log)

    req.once('close', function() {
      // Close internal object when user aborts request.
      lpServer.close(req.body.client)
    })
  })
  .listen(3000)