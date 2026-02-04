/**
 * chart.js - D3.js Lorenz curve visualization
 *
 * Creates interactive Lorenz curve charts comparing original and adjusted distributions.
 */

/**
 * LorenzChart class for creating and updating Lorenz curve visualizations
 */
export class LorenzChart {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);

        if (!this.container) {
            throw new Error(`Container element '${containerId}' not found`);
        }

        // Default options
        this.options = {
            margin: { top: 20, right: 25, bottom: 50, left: 55 },
            colors: {
                equality: '#9ca3af',
                survey: '#2563eb',
                adjusted: '#dc2626',
                paretoPoints: '#ef4444',
                grid: '#e5e7eb'
            },
            lineWidth: {
                equality: 1,
                survey: 2.5,
                adjusted: 2.5
            },
            animationDuration: 300,
            showGrid: true,
            showTooltip: true,
            ...options
        };

        // Initialize
        this.svg = null;
        this.xScale = null;
        this.yScale = null;
        this.tooltip = null;

        this.init();
    }

    init() {
        // Clear container
        this.container.innerHTML = '';

        // Get dimensions
        const rect = this.container.getBoundingClientRect();
        this.width = rect.width || 500;
        this.height = rect.height || 400;

        const { margin } = this.options;
        this.innerWidth = this.width - margin.left - margin.right;
        this.innerHeight = this.height - margin.top - margin.bottom;

        // Create SVG
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height)
            .attr('class', 'lorenz-chart');

        // Create main group with margins
        this.g = this.svg.append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);

        // Create scales
        this.xScale = d3.scaleLinear()
            .domain([0, 1])
            .range([0, this.innerWidth]);

        this.yScale = d3.scaleLinear()
            .domain([0, 1])
            .range([this.innerHeight, 0]);

        // Add grid
        if (this.options.showGrid) {
            this.addGrid();
        }

        // Add axes
        this.addAxes();

        // Add equality line
        this.addEqualityLine();

        // Create line generators
        this.lorenzLine = d3.line()
            .x(d => this.xScale(d.p))
            .y(d => this.yScale(d.l))
            .curve(d3.curveMonotoneX);

        // Create groups for curves
        this.surveyGroup = this.g.append('g').attr('class', 'survey-curve');
        this.adjustedGroup = this.g.append('g').attr('class', 'adjusted-curve');
        this.paretoPointsGroup = this.g.append('g').attr('class', 'pareto-points');

        // Create tooltip
        if (this.options.showTooltip) {
            this.createTooltip();
        }
    }

    addGrid() {
        const { colors } = this.options;

        // X grid lines
        this.g.append('g')
            .attr('class', 'grid grid-x')
            .attr('transform', `translate(0, ${this.innerHeight})`)
            .call(d3.axisBottom(this.xScale)
                .tickSize(-this.innerHeight)
                .tickFormat('')
                .tickValues([0.25, 0.5, 0.75]))
            .selectAll('line')
            .attr('stroke', colors.grid)
            .attr('stroke-dasharray', '3,3');

        // Y grid lines
        this.g.append('g')
            .attr('class', 'grid grid-y')
            .call(d3.axisLeft(this.yScale)
                .tickSize(-this.innerWidth)
                .tickFormat('')
                .tickValues([0.25, 0.5, 0.75]))
            .selectAll('line')
            .attr('stroke', colors.grid)
            .attr('stroke-dasharray', '3,3');

        // Remove domain lines from grid
        this.g.selectAll('.grid .domain').remove();
    }

    addAxes() {
        // X axis
        this.g.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0, ${this.innerHeight})`)
            .call(d3.axisBottom(this.xScale)
                .tickFormat(d => `${(d * 100).toFixed(0)}%`)
                .ticks(5)
                .tickValues([0, 0.25, 0.5, 0.75, 1]));

        // X axis label
        this.g.append('text')
            .attr('class', 'axis-label')
            .attr('x', this.innerWidth / 2)
            .attr('y', this.innerHeight + 40)
            .attr('text-anchor', 'middle')
            .attr('fill', '#374151')
            .attr('font-size', '12px')
            .text('Cumulative population share');

        // Y axis
        this.g.append('g')
            .attr('class', 'y-axis')
            .call(d3.axisLeft(this.yScale)
                .tickFormat(d => `${(d * 100).toFixed(0)}%`)
                .ticks(5)
                .tickValues([0, 0.25, 0.5, 0.75, 1]));

        // Y axis label
        this.g.append('text')
            .attr('class', 'axis-label')
            .attr('transform', 'rotate(-90)')
            .attr('x', -this.innerHeight / 2)
            .attr('y', -40)
            .attr('text-anchor', 'middle')
            .attr('fill', '#374151')
            .attr('font-size', '12px')
            .text('Cumulative income share');
    }

    addEqualityLine() {
        const { colors, lineWidth } = this.options;

        // 45-degree line (perfect equality)
        const equalityData = [{ p: 0, l: 0 }, { p: 1, l: 1 }];

        this.g.append('path')
            .datum(equalityData)
            .attr('class', 'equality-line')
            .attr('fill', 'none')
            .attr('stroke', colors.equality)
            .attr('stroke-width', lineWidth.equality)
            .attr('stroke-dasharray', '5,5')
            .attr('d', this.lorenzLine);
    }

    createTooltip() {
        this.tooltip = d3.select('body')
            .append('div')
            .attr('class', 'lorenz-tooltip')
            .style('position', 'absolute')
            .style('visibility', 'hidden')
            .style('background', 'rgba(255, 255, 255, 0.95)')
            .style('border', '1px solid #d1d5db')
            .style('border-radius', '6px')
            .style('padding', '8px 12px')
            .style('font-size', '12px')
            .style('box-shadow', '0 2px 8px rgba(0,0,0,0.15)')
            .style('pointer-events', 'none')
            .style('z-index', '1000');
    }

    /**
     * Update chart with new data
     *
     * @param {Object} data - Contains surveyLorenz, adjustedLorenz, and paretoPoints
     */
    update(data) {
        const { colors, lineWidth, animationDuration } = this.options;

        // Update survey curve
        if (data.surveyLorenz) {
            const surveyPath = this.surveyGroup.selectAll('path')
                .data([data.surveyLorenz]);

            surveyPath.enter()
                .append('path')
                .attr('fill', 'none')
                .attr('stroke', colors.survey)
                .attr('stroke-width', lineWidth.survey)
                .merge(surveyPath)
                .transition()
                .duration(animationDuration)
                .attr('d', this.lorenzLine);

            surveyPath.exit().remove();
        }

        // Update adjusted curve
        if (data.adjustedLorenz) {
            const adjustedPath = this.adjustedGroup.selectAll('path')
                .data([data.adjustedLorenz]);

            adjustedPath.enter()
                .append('path')
                .attr('fill', 'none')
                .attr('stroke', colors.adjusted)
                .attr('stroke-width', lineWidth.adjusted)
                .merge(adjustedPath)
                .transition()
                .duration(animationDuration)
                .attr('d', this.lorenzLine);

            adjustedPath.exit().remove();
        } else {
            this.adjustedGroup.selectAll('path').remove();
        }

        // Update Pareto points
        if (data.paretoPoints && data.paretoPoints.length > 0) {
            const points = this.paretoPointsGroup.selectAll('circle')
                .data(data.paretoPoints);

            points.enter()
                .append('circle')
                .attr('r', 4)
                .attr('fill', colors.paretoPoints)
                .attr('stroke', '#fff')
                .attr('stroke-width', 1.5)
                .merge(points)
                .on('mouseover', (event, d) => this.showTooltip(event, d, 'Pareto'))
                .on('mouseout', () => this.hideTooltip())
                .transition()
                .duration(animationDuration)
                .attr('cx', d => this.xScale(d.p))
                .attr('cy', d => this.yScale(d.l));

            points.exit().remove();
        } else {
            this.paretoPointsGroup.selectAll('circle').remove();
        }

        // Add invisible hover areas for tooltips on curves
        this.addHoverAreas(data);
    }

    addHoverAreas(data) {
        // Remove existing hover areas
        this.g.selectAll('.hover-area').remove();

        if (!this.options.showTooltip) return;

        // Create overlay for mouse tracking
        const overlay = this.g.append('rect')
            .attr('class', 'hover-area')
            .attr('width', this.innerWidth)
            .attr('height', this.innerHeight)
            .attr('fill', 'none')
            .attr('pointer-events', 'all');

        // Add vertical line for hover indicator
        const hoverLine = this.g.append('line')
            .attr('class', 'hover-line')
            .attr('stroke', '#6b7280')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3')
            .style('visibility', 'hidden');

        const hoverCircleSurvey = this.g.append('circle')
            .attr('class', 'hover-circle-survey')
            .attr('r', 5)
            .attr('fill', this.options.colors.survey)
            .style('visibility', 'hidden');

        const hoverCircleAdjusted = this.g.append('circle')
            .attr('class', 'hover-circle-adjusted')
            .attr('r', 5)
            .attr('fill', this.options.colors.adjusted)
            .style('visibility', 'hidden');

        overlay.on('mousemove', (event) => {
            const [mx] = d3.pointer(event);
            const p = this.xScale.invert(mx);

            if (p < 0 || p > 1) {
                hoverLine.style('visibility', 'hidden');
                hoverCircleSurvey.style('visibility', 'hidden');
                hoverCircleAdjusted.style('visibility', 'hidden');
                this.hideTooltip();
                return;
            }

            // Interpolate L values
            const surveyL = this.interpolate(data.surveyLorenz, p);
            const adjustedL = data.adjustedLorenz ? this.interpolate(data.adjustedLorenz, p) : null;

            // Update hover elements
            hoverLine
                .attr('x1', this.xScale(p))
                .attr('x2', this.xScale(p))
                .attr('y1', 0)
                .attr('y2', this.innerHeight)
                .style('visibility', 'visible');

            if (surveyL !== null) {
                hoverCircleSurvey
                    .attr('cx', this.xScale(p))
                    .attr('cy', this.yScale(surveyL))
                    .style('visibility', 'visible');
            }

            if (adjustedL !== null) {
                hoverCircleAdjusted
                    .attr('cx', this.xScale(p))
                    .attr('cy', this.yScale(adjustedL))
                    .style('visibility', 'visible');
            }

            // Show tooltip
            this.showCurveTooltip(event, p, surveyL, adjustedL);
        });

        overlay.on('mouseout', () => {
            hoverLine.style('visibility', 'hidden');
            hoverCircleSurvey.style('visibility', 'hidden');
            hoverCircleAdjusted.style('visibility', 'hidden');
            this.hideTooltip();
        });
    }

    interpolate(lorenz, p) {
        if (!lorenz || lorenz.length < 2) return null;
        if (p <= 0) return 0;
        if (p >= 1) return 1;

        // Find surrounding points
        let i = 0;
        while (i < lorenz.length - 1 && lorenz[i + 1].p < p) {
            i++;
        }

        if (i >= lorenz.length - 1) return lorenz[lorenz.length - 1].l;

        const p1 = lorenz[i].p;
        const p2 = lorenz[i + 1].p;
        const l1 = lorenz[i].l;
        const l2 = lorenz[i + 1].l;

        const t = (p - p1) / (p2 - p1);
        return l1 + t * (l2 - l1);
    }

    showTooltip(event, d, label) {
        if (!this.tooltip) return;

        this.tooltip
            .html(`
                <strong>${label}</strong><br>
                Population: ${(d.p * 100).toFixed(1)}%<br>
                Income: ${(d.l * 100).toFixed(1)}%
            `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px')
            .style('visibility', 'visible');
    }

    showCurveTooltip(event, p, surveyL, adjustedL) {
        if (!this.tooltip) return;

        let html = `<strong>Population:</strong> ${(p * 100).toFixed(1)}%<br>`;

        if (surveyL !== null) {
            html += `<span style="color:${this.options.colors.survey}">Survey:</span> ${(surveyL * 100).toFixed(1)}%<br>`;
        }

        if (adjustedL !== null) {
            html += `<span style="color:${this.options.colors.adjusted}">Adjusted:</span> ${(adjustedL * 100).toFixed(1)}%`;

            if (surveyL !== null) {
                const diff = ((adjustedL - surveyL) * 100).toFixed(1);
                html += `<br><span style="color:#6b7280">Diff: ${diff}%</span>`;
            }
        }

        this.tooltip
            .html(html)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px')
            .style('visibility', 'visible');
    }

    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style('visibility', 'hidden');
        }
    }

    /**
     * Clear all curves from chart
     */
    clear() {
        this.surveyGroup.selectAll('path').remove();
        this.adjustedGroup.selectAll('path').remove();
        this.paretoPointsGroup.selectAll('circle').remove();
        this.g.selectAll('.hover-area').remove();
    }

    /**
     * Resize chart to fit container
     */
    resize() {
        this.init();
    }

    /**
     * Destroy chart and clean up
     */
    destroy() {
        if (this.tooltip) {
            this.tooltip.remove();
        }
        this.container.innerHTML = '';
    }
}

/**
 * Create a simple legend component
 */
export function createLegend(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'legend-item d-flex align-items-center me-3';

        const swatch = document.createElement('span');
        swatch.className = 'legend-swatch';
        swatch.style.display = 'inline-block';
        swatch.style.width = '20px';
        swatch.style.height = '3px';
        swatch.style.backgroundColor = item.color;
        swatch.style.marginRight = '6px';

        if (item.dashed) {
            swatch.style.background = `repeating-linear-gradient(90deg, ${item.color}, ${item.color} 4px, transparent 4px, transparent 8px)`;
        }

        if (item.isPoint) {
            swatch.style.width = '8px';
            swatch.style.height = '8px';
            swatch.style.borderRadius = '50%';
        }

        const label = document.createElement('span');
        label.className = 'legend-label';
        label.style.fontSize = '13px';
        label.style.color = '#4b5563';
        label.textContent = item.label;

        div.appendChild(swatch);
        div.appendChild(label);
        container.appendChild(div);
    });
}
