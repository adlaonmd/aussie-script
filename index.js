const fs = require('fs')
const axiosDelimiter = require('./axiosDelimiter').api

//Assign your own API key inside the quotes(""). (https://developers.google.com/maps/documentation/places/web-service/get-api-key)
const GOOGLE_API_KEY = "INSERT_YOUR_GOOGLE_API_KEY_HERE"

//Used for loop checking
let TOTAL_TOWNS = 0;
let TOTAL_CATEGORIES_NUM = 0;
let TOTAL_PLACES = 0;

//Get the list of towns from townList.json file
let townList = null
try {
    townList = require('./townList.json')
} catch(error) {
    console.log('Missing/invalid "townList.json" file')
}

let towns = []

//Categories from Google Place Types (https://developers.google.com/maps/documentation/places/web-service/supported_types)
const categories = {
    travel: ["airport", "train_station", "bus_station", "subway_station", "transit_station"],
    activities: ["amusement_park", "aquarium", "art_gallery", "museum", "bowling_alley", "tourist_attraction", "zoo", "gym"],
    accommodations: ["lodging", "campground", "rv_park"],
    medical: ["doctor", "pharmacy", "hospital", "drugstore", "dentist"],
    vehicle: ["car_repair", "car_rental"],
    eating: ["cafe", "restaurant", "bakery", "meal_takeaway"],
    services: ["post_office", "library", "laundry"],
    fuel: ["gas_station"],
    supermarket: ["supermarket", "convenience_store"],
    landmarks: ["landmark", "natural_feature"],
    lawyer: ["lawyer"]
}

//Indexes for data processed
let townListProcessed = 0;
let searchProcessed = 0;
let placeDetailsProcessed = 0;

//Initialize the data structure
const initializeTowns = () => {
    console.log("//Initializing Towns...")

    townList.forEach((town, index) => {
        towns[index] = {
            town_id: "",
            town_name: "",
            town_lat: "",
            town_long: "",
            state_name: "",
            state_code: "",
            town_description: "",
            town_image_url: "",
            town_history: "",
            town_map_image_url: "",
            places: {
                travel: [],
                activities: [],
                accommodations: [],
                medical: [],
                vehicle: [],
                eating: [],
                services: [],
                fuel: [],
                supermarket: [],
                landmarks: [],
                lawyer: []
            }
        }

        towns[index].town_name = town.town_name
        towns[index].town_description = town.town_description
        towns[index].town_history = town.town_history
        towns[index].town_image_url = town.town_image_url

        TOTAL_TOWNS++
    })
}

//Get Town details
const getTownDetails = () => {
    console.log("//Getting Town Details...")
    towns.forEach(town => {
        axiosDelimiter.get(`https://maps.googleapis.com/maps/api/geocode/json?key=${GOOGLE_API_KEY}&address=${town.town_name}&region=AU`)
        .then(res => {
            let town_lat = res.data.results[0].geometry.location.lat
            let town_long = res.data.results[0].geometry.location.lng

            town.town_id = res.data.results[0].place_id
            town.state_code = res.data.results[0].address_components[2].short_name
            town.state_name = res.data.results[0].address_components[2].long_name
            town.town_lat = town_lat
            town.town_long = town_long
            town.town_map_image_url = getTownMapImageURL(town_lat, town_long)
            
            //Callback function once the fundamental details are filled
            townListProcessed++
            if(townListProcessed === TOTAL_TOWNS) {
                searchPlaces()
            }
        })
        .catch(err => {
            return console.log(err)
        })
    })
}

//Search Town for nearby Places sorted by prominence and get its ID
const searchPlaces = () => {
    console.log("//Searching Places...")

    towns.forEach((town, townIndex) => {
        let lat = town.town_lat
        let long = town.town_long

        let keys = Object.keys(categories)
        keys.forEach(key => {
            categories[key].forEach(category => {
                axiosDelimiter.get(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?key=${GOOGLE_API_KEY}&location=${lat},${long}&radius=50000&type=${category}`)
                .then(res => {
                    if(res.data.status === "ZERO_RESULTS") {
                        console.log(`No places found in "${category}" category`)
                    }

                    res.data.results.forEach(result => {
                        //Insert the Place according to its category
                        town.places[key].push({
                            place_id: result.place_id
                        })
                        TOTAL_PLACES++
                    })

                    searchProcessed++
                    if(searchProcessed === TOTAL_CATEGORIES_NUM) {
                        console.log(`Total number of places: ${TOTAL_PLACES}`)
                        getPlaceDetails()
                    }
                })
            })
        })
    })
}

//Get the Place Details using their respective place_id
const getPlaceDetails = () => {
    console.log("//Getting Place Details...")

    towns.forEach(town => {
        let keys = Object.keys(categories)
        keys.forEach(key => {
            town.places[key].forEach((place, index) => {
                axiosDelimiter.get(`https://maps.googleapis.com/maps/api/place/details/json?key=${GOOGLE_API_KEY}&place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,rating,review,user_ratings_total`)
                .then(res => {
                    //Defaults to avoid errors
                    let placeName = ""
                    let placeAddress = ""
                    let placePhoneNumber = ""
                    let placeWebsite = ""
                    let placeRating = 0;
                    let placeTotalRating = 0;
                    let placeReviews = []

                    //Assign their value or fallback to default value
                    Object.assign(town.places[key][index], {
                        place_name: res.data.result.name || placeName,
                        place_address: res.data.result.formatted_address || placeAddress,
                        place_phone_number: res.data.result.formatted_phone_number || placePhoneNumber,
                        place_website: res.data.result.website || placeWebsite,
                        place_image_url: "",
                        place_rating: res.data.result.rating || placeRating,
                        place_total_ratings: res.data.result.user_ratings_total || placeTotalRating,
                        place_reviews: res.data.result.reviews || placeReviews
                    })

                    //Progress indicator of places processed
                    placeDetailsProcessed++
                    if(placeDetailsProcessed % 10 == 0 && placeDetailsProcessed != 0) {
                        console.log(`Places processed: ${placeDetailsProcessed}/${TOTAL_PLACES}`)
                    }

                    if(placeDetailsProcessed === TOTAL_PLACES) {
                        saveFile()
                    }
                })
                .catch(err => {
                    return console.log(err)
                })
            })
        })
    })
}

//Save the file as results.json
const saveFile = () => {
    console.log("//Saving file...")

    let jsonContent = JSON.stringify(towns, null, "\t")
    fs.writeFile("result.json", jsonContent, "utf8", err => {
        if(err){
            console.log("An error has occured")
            return console.log(err)
        }
        return console.log("JSON file has been saved - result.json")
    })
}

//Get Town Map image
const getTownMapImageURL = (lat, long) => {
    return `https://maps.googleapis.com/maps/api/staticmap?key=${GOOGLE_API_KEY}&center=${lat},${long}&zoom=12&size=600x400`
}


//Main function
const cmd = () => {
    if(!townList) {
        console.log("Exiting the program...")
        return
    }

    // Create array based on Town List file
    initializeTowns()

    if(TOTAL_TOWNS === 0) {
        console.log("No towns found.\nExiting the program...")
        return
    }

    //Calculate the total number of categories based on the number of towns
    let keys = Object.keys(categories)
    keys.forEach(key => {
        categories[key].forEach(() => {
            TOTAL_CATEGORIES_NUM += 1
        })
    })
    TOTAL_CATEGORIES_NUM *= TOTAL_TOWNS

    //Starting point of getting data
    getTownDetails()
}

cmd()