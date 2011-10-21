$(document).ready(function() {
	base = "/api/networks";
	$.getJSON(base, function(networks) {
		network_count = networks.length;
		for (var n=0; n < network_count; n++) {
			$("#root").append("<div id=\"" + networks[n] + "\"/>");
			$.getJSON(base + "/" + networks[n], function (n_id) {
				return function(channels) {
					$.map(channels, function (c) {
						$(n_id).append("<li>"+c+"</li>");
					});
				}}("#"+networks[n]));
		}
	});
});
