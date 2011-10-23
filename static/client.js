$(document).ready(function() {
	$("#content").tabs();
	base = "/api/networks";
	$.getJSON(base, function(networks) {
		network_count = networks.length;
		for (var n=0; n < network_count; n++) {
			var n_id = networks[n];
			$("#root").append("<div id=\"" + n_id + "\"/>");
			$("#"+n_id).addClass("network");
			$.getJSON(base + "/" + networks[n], function (n_id) {
				return function(channels) {
					$(n_id).append("<ul></ul>");
					$(n_id + " ul").addClass("channels");
					$.map(channels, function (c) {
						$(n_id + " ul").append("<li>"+c+"</li>");
					});
				}}("#"+n_id));
		}
	});
});
