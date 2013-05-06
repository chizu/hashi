angular.module('HashiServices', ['ngResource']).
    factory('Network', function($resource){
	return $resource('/hashi/api/networks/:hostname');
    });