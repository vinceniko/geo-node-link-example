import {
    group,
    ungroup,
    getCountries,
    groupDifferences,
    geoJSON,
} from "./data.js"

export { processData, Config }

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

function purposes(data) {
    let categories = []
    data.forEach(d => {

        Object.entries(d.purposes).forEach((entry, i) => {
            let key = entry[0]
            let val = entry[1]

            let obj = {
                source: d.source,
                target: d.target,
                amount: val,
                purpose: key,
                edgeNumber: i
            }
            categories.push(obj)
        })
    })

    return categories
}

async function processData() {
    let store = {}

    store.config = new Config(1500, 1000, 0.15)


    store.data = await d3.csv("aiddata-countries-only.csv")
    store.geo = await geoJSON(store.config, "countries.geo.json") // {features, path}
    store.grouped = group(store.data)
    store.ungrouped = ungroup(store.grouped)
    store.index = getCountries(store.ungrouped)
    store.differences = groupDifferences(store.data)
    store.purposes = purposes(store.ungrouped)
    console.log(store)

    return store
}