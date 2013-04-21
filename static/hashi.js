angular.module('Hashi', ['HashiServices', 'ngCookies']).
    config(['$routeProvider', function($routeProvider) {
	$routeProvider.
	    when('/network', {templateUrl: 'templates/network-config.html',
			      controller: NetworkConfigController}).
	    when('/network/:hostname', {templateUrl: 'templates/network.html',
					controller: NetworkController}).
	    when('/network/:hostname/:channel', {templateUrl: 'templates/channel.html',
						 controller: ChannelController}).
	    when('/landing', {templateUrl: 'templates/landing.html',
			      controller: LandingController}).
	    otherwise({redirectTo: '/landing'});
    }]);
