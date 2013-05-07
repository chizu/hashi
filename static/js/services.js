angular.module('HashiServices', ['ngResource'])
    .factory('Networks', function($resource) {
	return $resource('/hashi/api/networks/:hostname');
    })
    .factory('Channels', function($resource) {
	return $resource('/hashi/api/channels/:name');
    });