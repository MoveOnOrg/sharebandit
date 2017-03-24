Writing and Installing 'Modules'
--------------------------------

A module extends navigation and admin.  Include it in your module js code
somewhere locally and add in config.json

  "extensionModules": ["path/to/module.js"],

Your module.js file should look something like this:
```
   var init = function(app, schema, sequelize, adminauth) {
      app.get('/yourapp/admin',
        adminauth,
        function(req, res) {
          res.send( "here is your admin");
        });

      return {
         link: {link: '/supershare/admin', title: 'SuperShare'},
         viewDirectory: __dirname + "views/"
      }
   }

   module.exports = init;
```
