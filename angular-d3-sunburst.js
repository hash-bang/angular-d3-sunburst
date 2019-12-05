angular.module('angular-d3-sunburst', [])
.directive('sunburst', function() {
	return {
		scope: {
			sunburst: '=',
			tooltip: '&?'
		},
		restrict: 'AE',
		controller: function($scope, $element) {
			// Rendering options {{{
			$scope.margin = {top: 350, right: 480, bottom: 350, left: 480};
			$scope.radius = Math.min($scope.margin.top, $scope.margin.right, $scope.margin.bottom, $scope.margin.left) - 10;
			// }}}

			// D3 helper functions {{{
			// Generic helpers {{{
			$scope.updateArc = function(d) {
				return {depth: d.depth, x: d.x, dx: d.dx};
			};

			$scope.arcTween = function(b) {
				var i = d3.interpolate(this._current, b);
				this._current = i(0);
				return function(t) {
					return $scope.arc(i(t));
				};
			};

			$scope.computeTextRotation = function(d) {
				return (d.x +d.dx/2) * 180 / Math.PI - 90	
			};

			$scope.key = function(d) {
				var k = [], p = d;
				while (p.depth) k.push(p.name), p = p.parent;
				return k.reverse().join(".");
			};

			$scope.fill = function(d) {
				var p = d;
				while (p.depth > 1) p = p.parent;
				var c = d3.lab($scope.hue(p.name));
				c.l = $scope.luminance(d.sum);
				return c;
			}
			// }}}

			// Mouse handling {{{
			$scope.mouseOverArc = function(d) {
				d3.select(this).attr("stroke","black")
				if ($scope.tooltip) {
					$scope.tooltipElem.html($scope.tooltip()(d));
					return $scope.tooltipElem.transition()
						.duration(50)
						.style("opacity", 0.9);
				}
			};

			$scope.mouseOutArc = function() {
				d3.select(this).attr("stroke","")
				return $scope.tooltip ? $scope.tooltipElem.style("opacity", 0) : false;
			};

			$scope.mouseMoveArc = function(d) {
				return $scope.tooltip ? $scope.tooltipElem
					.style("top", (d3.event.layerY-10)+"px")
					.style("left", (d3.event.layerX+10)+"px")
					: false;
			};
			// }}}

			// Zoom handling {{{
			$scope.zoomIn = function(p) {
				if (p.depth > 1) p = p.parent;
				if (!p.children) return;
				$scope.zoom(p, p);
			};

			$scope.zoomOut = function(p) {
				if (!p.parent) return;
				$scope.zoom(p.parent, p);
			}

			$scope.zoom = function(root, p) { // Zoom to the specified new root.
				if (document.documentElement.__transition__) return;

				// Rescale outside angles to match the new layout.
				var enterArc, exitArc;
				var outsideAngle = d3.scale.linear().domain([0, 2 * Math.PI]);

				function insideArc(d) {
					return p.key > d.key
						? {depth: d.depth - 1, x: 0, dx: 0} : p.key < d.key
						? {depth: d.depth - 1, x: 2 * Math.PI, dx: 0}
						: {depth: 0, x: 0, dx: 2 * Math.PI};
				}

				function outsideArc(d) {
					return {depth: d.depth + 1, x: outsideAngle(d.x), dx: outsideAngle(d.x + d.dx) - outsideAngle(d.x)};
				}

				$scope.center.datum(root);

				// When zooming in, arcs enter from the outside and exit to the inside.
				// Entering outside arcs start from the old layout.
				if (root === p) enterArc = outsideArc, exitArc = insideArc, outsideAngle.range([p.x, p.x + p.dx]);
				
				var new_data = $scope.partition.nodes(root).slice(1)

				$scope.path = $scope.path.data(new_data, function(d) { return d.key; });
					 
				 // When zooming out, arcs enter from the inside and exit to the outside.
				// Exiting outside arcs transition to the new layout.
				if (root !== p) enterArc = insideArc, exitArc = outsideArc, outsideAngle.range([p.x, p.x + p.dx]);

				d3.transition().duration(d3.event.altKey ? 7500 : 750).each(function() {
					$scope.path.exit().transition()
						.style("fill-opacity", function(d) { return d.depth === 1 + (root === p) ? 1 : 0; })
						.attrTween("d", function(d) { return $scope.arcTween.call(this, exitArc(d)); })
						.remove();
					  
					$scope.path.enter().append("path")
						.style("fill-opacity", function(d) { return d.depth === 2 - (root === p) ? 1 : 0; })
						.style("fill", function(d) { return d.fill; })
						.on("click", $scope.zoomIn)
						.on("mouseover", $scope.mouseOverArc)
						.on("mousemove", $scope.mouseMoveArc)
						.on("mouseout", $scope.mouseOutArc)
						.each(function(d) { this._current = enterArc(d); });
					
					$scope.path.transition()
						.style("fill-opacity", 1)
						.attrTween("d", function(d) { return $scope.arcTween.call(this, $scope.updateArc(d)); });
				});
				
				
				$scope.texts = $scope.texts.data(new_data, function(d) { return d.key; })
				 
				$scope.texts.exit()
					.remove()	
				$scope.texts.enter()
					.append("text")
					
				$scope.texts
					.style("opacity", 0)
					.attr("transform", function(d) { return "rotate(" + $scope.computeTextRotation(d) + ")"; })
					.attr("x", function(d) { return $scope.radius / 3 * d.depth; })	
					.attr("dx", "6") // margin
					.attr("dy", ".35em") // vertical-align
					.filter(function(d, i) {
						return (d.dx*d.depth*$scope.radius/3)>14
					})
					.text(function(d,i) {return d.name})
					.transition().delay(750).style("opacity", 1)
			};
			// }}}
			// }}}

			// Build initial chart {{{
			$scope.svg;
			$scope.arc;
			$scope.partition;
			$scope.hue;
			$scope.luminance;
			$scope.tooltip;

			$scope.initBuild = function() {
				$scope.hue = d3.scale.category10();

				$scope.luminance = d3.scale.sqrt()
					.domain([0, 1e6])
					.clamp(true)
					.range([90, 20]);

				$scope.svg = d3.select($element[0]).append("svg")
					.classed('d3-sunburst', true)
					.attr("width", $scope.margin.left + $scope.margin.right)
					.attr("height", $scope.margin.top + $scope.margin.bottom)
					.append("g")
					.attr("transform", "translate(" + $scope.margin.left + "," + $scope.margin.top + ")");

				$scope.partition = d3.layout.partition()
					.sort(function(a, b) { return d3.ascending(a.name, b.name); })
					.size([2 * Math.PI, $scope.radius]);

				$scope.arc = d3.svg.arc()
					.startAngle(function(d) { return d.x; })
					.endAngle(function(d) { return d.x + d.dx - .01 / (d.depth + .5); })
					.innerRadius(function(d) { return $scope.radius / 3 * d.depth; })
					.outerRadius(function(d) { return $scope.radius / 3 * (d.depth + 1) - 1; });

				if ($scope.tooltip)
					$scope.tooltipElem = d3.select($element[0])
						.classed('d3-tooltip', true)
						.append("div")
						.style("position", "absolute")
						.style("z-index", "10")
						.style("opacity", 0);

			var root_ = null;
		};
		// }}}

			// Data refresher {{{
			$scope.center;
			$scope.path;
			$scope.texts;

			$scope.refresh = function() {
				$scope.partition
					.value(function(d) { return d.size; })
					.nodes($scope.sunburst)
					.forEach(function(d) {
						d._children = d.children;
						d.sum = d.value;
						d.key = $scope.key(d);
						d.fill = $scope.fill(d);
					});

				// Now redefine the value function to use the previously-computed sum.
				$scope.partition
					.children(function(d, depth) { return depth < 2 ? d._children : null; })
					.value(function(d) { return d.sum; });

				$scope.center = $scope.svg.append("circle")
					.attr("r", $scope.radius / 3)
					.on("click", $scope.zoomOut);

				$scope.center.append("title")
					.text("zoom out");
				  
				var partitioned_data = $scope.partition.nodes($scope.sunburst).slice(1)

				$scope.path = $scope.svg.selectAll("path")
					.data(partitioned_data)
				.enter().append("path")
					.attr("d", $scope.arc)
					.style("fill", function(d) { return d.fill; })
					.each(function(d) { this._current = $scope.updateArc(d); })
					.on("click", $scope.zoomIn)
					.on("mouseover", $scope.mouseOverArc)
					.on("mousemove", $scope.mouseMoveArc)
					.on("mouseout", $scope.mouseOutArc);
				
				  
				$scope.texts = $scope.svg.selectAll("text")
					.data(partitioned_data)
					.enter().append("text")
					.filter(function(d, i) {
						return (d.dx*d.depth*$scope.radius/3)>14
					})
					.attr("transform", function(d) { return "rotate(" + $scope.computeTextRotation(d) + ")"; })
					.attr("x", function(d) { return $scope.radius / 3 * d.depth; })	
					.attr("dx", "6") // margin
					.attr("dy", ".35em") // vertical-align	
					.text(function(d,i) {return d.name})
			};
			// }}}

			$scope.$watch('sunburst', function() {
				if (!$scope.sunburst) return; // No data yet
				$scope.refresh();
			});

			$scope.initBuild();
		}
	}
});
