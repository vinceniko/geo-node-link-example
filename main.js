export {
    main
}

// canvas config
class Config {
    constructor(width, height, marginScale) {
        this.dimension = {
            "width": width,
            "height": height
        }

        this.margin = {
            "left": this.dimension.width * marginScale,
            "top": this.dimension.height * marginScale
        }

        this.body = {
            "width": this.dimension.width - this.margin.left,
            "height": this.dimension.height - this.margin.top
        }

        this.extent = this.getBodyExtent()
        this.center = this.getBodyCenter()
        this.createContainer()
    }

    static getCenter(dimension) { return dimension / 2 }

    getBodyCenter() {
        this.center = {
            "x": Config.getCenter(this.dimension.width) + this.margin.left,
            "y": Config.getCenter(this.dimension.height) + this.margin.top,
        }

        return this.center
    }
    getBodyExtent() {
        this.extent = {
            "width": this.margin.left + this.body.width,
            "height": this.margin.top + this.body.height
        }

        return this.extent
    }

    createContainer() {
        this.container = d3.select("svg")
            .attr("width", this.dimension.width)
            .attr("height", this.dimension.height)

        return this.container
    }
}

// see processData comments
function purposes(data) {
    let transactions = []
    data.forEach(d => {
        Object.entries(d.purposes).forEach((entry, i) => {
            let purpose = entry[0]
            let amount = entry[1]

            let obj = {
                source: d.source,
                target: d.target,
                amount,
                purpose,
                edgeNumber: i
            }
            transactions.push(obj)
        })
    })

    return transactions
}

// see processData comments
function groupDifferences(data) {
    let result = data.reduce((result, d) => {
        let amount = parseFloat(d.commitment_amount_usd_constant);

        d.donor in result ? result[d.donor].donated += amount : result[d.donor] = {
            "country": d.donor,
            "donated": amount,
            "recieved": 0,
            "total": 0
        };

        result[d.donor].total += amount

        d.recipient in result ? result[d.recipient].recieved += amount :
            result[d.recipient] = {
                "country": d.recipient,
                "donated": 0,
                "recieved": amount,
                "total": 0
            }

        result[d.recipient].total += amount

        return result
    }, {})

    Object.entries(result).forEach(entry => {
        let key = entry[0]
        let val = entry[1]
        result[key].difference = val.recieved - val.donated
    })

    return result
}

// loads geoJSON data and returns object with info
async function geoJSON(config) {
    let geoJSON = await d3.json("countries.geo.json")
    let path = d3.geoPath(
        d3.geoMercator()
            .scale(180)
            .translate([config.center.x/1.5, config.center.y/1.5])
    )
    let dictFeatures = geoJSON.features.reduce((result, d) => {
        if (d.properties.name == "United States of America") {
            let maxLength = Math.max(...d.geometry.coordinates.map(d => d.length))
            d.geometry.coordinates = d.geometry.coordinates.filter(d => d.length == maxLength)
            result["United States"] = d
        } else if (d.properties.name == "South Korea") {
            result["Korea"] = d
        } else if (d.properties.name == "Slovakia") {
            result["Slovak Republic"] = d
        } else {
            result[d.properties.name] = d
        }

        return result
    }, {})

    return {
        "features": dictFeatures,
        "path": path,
        "centroids": (() => {
            let centroidsDict = {}
            for (let arr of Object.entries(dictFeatures)) {
                let key = arr[0]
                let val = arr[1]
                let centroid = path.centroid(val)
                centroidsDict[key] = {
                    "x": centroid[0],
                    "y": centroid[1]
                }
            }
            return centroidsDict
        })()
    }
}

// see processData inline comments
function group(data) {
    let grouped = data.reduce((result, d) => {
        let amount = parseFloat(d.commitment_amount_usd_constant);
        let purpose = d.coalesced_purpose_name

        let recurse = () => {
            if (d.donor in result) {
                if (d.recipient in result[d.donor]) {
                    result[d.donor][d.recipient].amount += amount
                    if (purpose in result[d.donor][d.recipient].purposes)
                        result[d.donor][d.recipient].purposes[purpose] += amount
                    else 
                        result[d.donor][d.recipient].purposes[purpose] = amount
                } else {
                    result[d.donor][d.recipient] = {
                        "source": d.donor,
                        "target": d.recipient,
                        "amount": amount,
                        "purposes": {
                
                        }
                        
                    }
                    result[d.donor][d.recipient].purposes[purpose] = amount 
                }
            } else {
                result[d.donor] = {} // recipient
                recurse()
            }
        }
        recurse()

        return result;
    }, {})

    return grouped
}

// see processData comments
function ungroup(data) {
    let result = []
    for (let target of Object.values(data)) {
        let vals = Object.values(target)
        vals.map(d => result.push(d))
    }

    return result
}

// getCountries returns a set with all the countries in the dataset. used as an index
function getCountries(data) {
    let set = new Set
    data.map((d, i) => {
        set.add(d.source)
        set.add(d.target)
    })

    return Array.from(set)
}

// creates store
async function processData() {
    let store = {}

    store.config = new Config(1500, 1000, 0.15)


    store.data = await d3.csv("aiddata-countries-only.csv") // original data
    store.geo = await geoJSON(store.config, "countries.geo.json") // {features, path}
    store.grouped = group(store.data) // {sourceCountry: {targetCountry}}
    store.ungrouped = ungroup(store.grouped)  // used as links; where (source, target) belong to a set
    store.index = getCountries(store.ungrouped) // set of countries
    store.differences = groupDifferences(store.data) // comparison of country specific donations and income
    store.purposes = purposes(store.ungrouped) // ungrouped as a set of (sourceCountry, targetCountry, purpose)

    return store
}

function createElements(container, data, stats, geo) {
    container
        .append('defs')
        .selectAll('marker')
        .data(data.nodes)
        .enter()
            .append('marker')
            .attr('id', d => `arrowhead_${d.id.replace(" ", "_")}`)
            .attr('viewBox', '-0 -5 10 10')
            .attr('refX', d => `${d.radius + 20}px`) // idk why the offset isn't computed correctly and needs a constant to be shown outside of the node
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr("markerUnits", "userSpaceOnUse")
            .attr('markerWidth', 7)
            .attr('markerHeight', 7)
            .attr('xoverflow', 'visible')
            .append('svg:path')
            .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
            .attr('fill', '#282828')
            .style('stroke', 'limegreen')

    let links = container.append("g")
        .attr("class", "links")
        .selectAll("line")
    // grey: below quantile
    links.data(data.links.filter(d => d.amount < stats.quantile))
        .enter()
        .append("line")
        .attr("stroke", "#E8E8E8")
    // above quantile but not from mostly recieved to mostly donated 
    links.data(data.links.filter(d => d.amount >= stats.quantile && data.supplement.differences[d.target].difference < 0 || data.supplement.differences[d.source].difference >= 0))
        .enter()
        .append("line")
        .attr("stroke", "#E8E8E8")
    // black: mostly recieve to mostly donated
    links.data(data.links.filter(d => d.amount >= stats.quantile && data.supplement.differences[d.target].difference >= 0 && data.supplement.differences[d.source].difference < 0))
        .enter()
        .append("line")
        .attr("stroke", "black")
        .attr("stroke-width", d => Math.pow(d.amount / stats.total, 0.5) * 10)
        .attr('marker-end', d => `url(#arrowhead_${d.target.replace(" ", "_")})`)
        .attr('marker-end', d => `url(#arrowhead_${d.target.replace(" ", "_")})`)

    // node colors, green or red
    // green if mostly recieved
    // red if mostly donated 
    container.append("g")
        .attr("class", "nodes")
        .selectAll("circle")
        .data(data.nodes)
        .enter()
        .append("circle")
        .attr("r", d => d.radius)
        .attr("fill", d => data.supplement.differences[d.id].difference >= 0 ? "green" : "red")
        .attr("stroke", "black")

    // country codes
    container.append("g")
        .attr("class", "annotations")
        .selectAll("text")
        .data(data.nodes)
        .enter()
            .append("text")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .attr("fill", "white")
            .attr("font-size", d => d.radius * 0.9)
            .text(d => geo.features[d.id].id)
}

function updateElements() {
    d3.select(".links")
        .selectAll("line")
        .attr("x1", d => { return d.source.x })
        .attr("y1", d => { return d.source.y })
        .attr("x2", d => { return d.target.x })
        .attr("y2", d => { return d.target.y })

    d3.select(".nodes")
        .selectAll("circle")
        .attr("cx", function (d) { return d.x })
        .attr("cy", function (d) { return d.y });

    d3.select(".annotations")
        .selectAll("text")
        .attr("x", d => { return d.x })
        .attr("y", d => { return d.y })
}

// countries that are missing from the geoJSON file
function filterMissing(data, geo) {
    let missing = []
    data.nodes = data.nodes.filter(d => {
        try {
            geo.centroids[d.id]['x']
            geo.centroids[d.id]['y']

            return true
        } catch (e) {
            missing.push(d.id)
            return false
        }
    })

    data.links = data.links.filter(d => {
        if (!(missing.includes(d.source) || missing.includes(d.target))) {
            return d
        }
    })

    return data
}

// sets initial x and y of nodes based on geoJSON data
function setNodeCentroid(data, geo) {
    data.nodes = data.nodes.map(d => {
        d.x = geo.centroids[d.id]['x']
        d.y = geo.centroids[d.id]['y']

        return d
    })

    return data
}

function computeNodeRadius(data, stats, radius) {
    data.nodes = data.nodes.map(d => {
        d.radius = Math.pow(stats.totals[d.id] / stats.total, 0.3) * radius
        const minSize = 5
        d.radius = d.radius < minSize ? minSize : d.radius

        return d
    })

    return data
}

// data wide stats such as total amount donated
function getStats(data) {
    let stats = {}

    stats.quantile = d3.quantile(data.links.map(d => d.amount).sort((a,b) => a-b), 0.85)
    stats.total = data.links.reduce((result, d) => { result += d.amount; return result }, 0)
    stats.totals = data.links.reduce((result, d) => {
        if (d.source in result) {
            result[d.source] += d.amount
        } else {
            result[d.source] = 0
        }
        if (d.target in result) {
            result[d.target] += d.amount
        } else {
            result[d.target] = 0
        }
        return result
    }, {})

    return stats
}

function drawLegend(config) {
    let {
        container,
        body,
    } = config;
    var legend = container.append("g")
        .attr("font-family", "sans-serif")
        .attr("font-size", 10)
        .attr("text-anchor", "end")
        .selectAll("g")
        .data(["Mostly Donated", "Mostly Recieved"])
        .enter().append("g")
        .attr("transform", (d, i) => `translate(${-250}, ${(100+ i * 40)})`) // (0,0) is top right corner
    legend.append("circle")
        .attr("cx", body.width - 19)
        .attr("dy", "10%")
        .attr("r", 10)
        .attr("fill", (d,i) => i ? "green" : "red")
    legend.append("text")
        .attr("x", body.width - 30)
        .attr("y", 0)
        .attr("dy", "0.32em")
        .text(d => d);
}

function showData(config, data, geo) {
    data = filterMissing(data, geo)
    data = setNodeCentroid(data, geo)

    let stats = getStats(data)
    const radius = 40
    data = computeNodeRadius(data, stats, radius)
    
    createElements(config.container, data, stats, geo, radius)

    function boxingForce(radius) {
        for (let node of data.nodes) {
            // if the positions exceed the box, set them to the boundary position.
            // You may want to include your nodes width to not overlap with the box.
            node.x = Math.max(-config.body.width + radius, Math.min(config.body.width - radius, node.x));
            node.y = Math.max(-config.body.height + radius, Math.min(config.body.height - radius, node.y));
        }
    }

    d3.forceSimulation()
        .nodes(data.nodes)
        .force("link", d3.forceLink(data.links).id((d) => { if (d.id in geo.centroids) { return d.id } }).strength(0))
        .force("charge", d3.forceCollide(d => d.radius + 10)) // or +20
        .on("tick", () => { updateElements() })
        .force("bounds", () => {boxingForce(radius)})

    drawLegend(config)
}

async function main() {
    let store = await processData()

    console.log(store)

    store.config.container = store.config.container
        .append("g")
        .attr("transform", `translate(0,0)`)

    showData(store.config, {
        "nodes": store.index.map(d => { return { "id": d } }),
        "links": store.ungrouped,
        "supplement": {
            "differences": store.differences
        }
    }, store.geo)
}