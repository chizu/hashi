App = Ember.Application.create({LOG_TRANSITIONS: true});

App.Store = DS.Store.extend({
    revision: 12
});

DS.RESTAdapter.configure("plurals", {
    // There is only ever one session accessible to a user (theirs)
    // It'd be nice if singletons didn't need this
    session: 'session'
});
    
DS.RESTAdapter.reopen({
    namespace: 'hashi/api',
});

App.Session = DS.Model.extend({
    uid: DS.attr("number"),
    email: DS.attr("string"),
});

App.Network = DS.Model.extend({
    email: DS.attr("string"),
    hostname: DS.attr("string"),
    port: DS.attr("number"),
    ssl: DS.attr("boolean"),
    nick: DS.attr("string")
});

App.Router.map(function() {
    this.route("networks");
});

App.NetworksRoute = Ember.Route.extend({
    model: function () {
	return App.Network.find();
    }
});

App.ApplicationController = Ember.Controller.extend({
    session: null,
    init: function () {
	this._super();
	// There is never more than one session per instance
	this.session = App.Session.find(0);
	console.log(this.session);
    },
    login: function () {
	var application = this;

	// Indicate activity by greying out the BrowserID button
	$('#browserid').fadeTo("fast", 0.4);
	// Should make this come back somehow if you close the login window

	navigator.id.watch({
	    loggedInUser: null,
	    onlogin: function (assertion) {
		$.ajax({
		    type: 'POST',
		    url: '../api/login',
		    dataType: 'json',
		    data: { assertion: assertion },
		    success: function(res, status, xhr) {
			if (res === null) {
			    console.log("bad browserid assertion");
			}
			else {
			    console.log("login success");
			    application.set("session", App.Session.find(1));
			}
		    },
		    error: function(res, status, xhr) {
			console.log("login failure: " + res);
		    }
		});
	    },
	    onlogout: function () {
		$('#browserid').fadeTo("fast", 1.0);
	    },
	});
	navigator.id.request();
    },
    logout: function () {
	var application = this;
	$.ajax({
            type: 'POST',
            url: '../api/logout',
            success: function () {
		application.set("session", null);
	    },
	});
    },
});
