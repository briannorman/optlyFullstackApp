const optimizelySDK = require('@optimizely/optimizely-sdk');
const NOTIFICATION_TYPES = require('@optimizely/optimizely-sdk').enums.NOTIFICATION_TYPES;
const userId = require('uuid/v1');

const prodURL = 'https://cdn.optimizely.com/datafiles/C2ubQ7qq1xEUE1y4PrGjj6.json';
const devURL = 'https://cdn.optimizely.com/datafiles/RNDEcVmHyYbT16yGMtwZNm.json';

const rp = require('request-promise');
const Input = require('prompt-input');

const varArg = process.argv.slice(2);
let forceVariation = varArg[0];

const envArg = process.argv.slice(3);
let isDev = envArg[0] === '--dev';

const devOptions = {uri: devURL, json: true};
const prodOptions = {uri: prodURL, json: true};

let envOptions;
if (isDev) {
    console.log('Dev environment');
    envOptions = devOptions;
} else {
    envOptions = prodOptions;
}

const onActivate = function (activateObject) {
    console.log(`activate called for experiment ${activateObject.experiment.key}`);
};
const onTrack = function (trackObject) {
    console.log(`track called for event ${trackObject.eventKey}`);
};

//request to retrieve the datafile
rp(envOptions).then(function (datafile) {

    // Instantiate an Optimizely client upon retrieving datafile
    const optimizelyClientInstance = optimizelySDK.createInstance({datafile: datafile});

    // Add an ACTIVATE notification listener
    optimizelyClientInstance.notificationCenter.addNotificationListener(NOTIFICATION_TYPES.ACTIVATE, onActivate);

    // Add a TRACK notification listener
    optimizelyClientInstance.notificationCenter.addNotificationListener(NOTIFICATION_TYPES.TRACK, onTrack);

    let userLocation;
    let locationQuestion = new Input({message: `Do you live in the United States? (y/n): `});
    locationQuestion.run().then(function (response) {
        if (response === 'y') userLocation = 'USA';
        else userLocation = 'i18n';

        let attributes = { location: userLocation };

        let variation = optimizelyClientInstance.activate('trip_suggester', userId(), attributes);
        if (forceVariation === '-v1') {
            variation = 'variation_1';
            optimizelyClientInstance.setForcedVariation('trip_suggester', userId(), 'variation_1')
        } else if (forceVariation === '-v2') {
            variation = 'variation_2';
            optimizelyClientInstance.setForcedVariation('trip_suggester', userId(), 'variation_2')
        }

        console.log(`DEBUG: User "${userId()}" has been bucketed in Variation 1`);
        if (variation === 'variation_1') {
            console.log(`Hello ${userId()}, you deserve a vacation.  Let me help you find something spectacular.`);
            decideTrip();
        } else if (variation === 'variation_2') {
            console.log(`Howdy there ${userId()}! I reckon you ought to be due for some R&R.  No sweat Tex, I've got just the spot for you!`);
            decideTrip();
        } else {
            console.log('You should travel to the United States!');
        }

        function suggestTrip(weatherResponseString) {
            if (weatherResponseString === 'cold') {
                if (variation === 'variation_1') {
                    console.log('You should take a ski trip to Colorado!');
                } else if (variation === 'variation_2') {
                    console.log('You should take a ski trip to Montana!');
                }
            } else if (weatherResponseString === 'warm') {
                if (variation === 'variation_1') {
                    console.log('You should take a beach vacation in Punta Cana!');
                } else if (variation === 'variation_2') {
                    console.log('You should take a beach vacation in Mexico!');
                }
            }
        }

        function getWeatherResponseString(response) {
            let responseString;

            if (parseInt(response) === 1) {
                responseString = 'warm';
                optimizelyClientInstance.track('warm_weather', userId(), attributes);
            } else if (parseInt(response) === 2) {
                optimizelyClientInstance.track('cold_weather', userId(), attributes);
                responseString = 'cold';
            }

            return responseString;
        }

        function suggestCruise(weatherResponseString) {
            let coldDestination = optimizelyClientInstance.getFeatureVariableString('cruise_option', 'cold', userId());
            let warmDestination = optimizelyClientInstance.getFeatureVariableString('cruise_option', 'warm', userId());

            let destination = '';

            if (weatherResponseString === 'warm') {
                destination = warmDestination;
            } else if (weatherResponseString === 'cold') {
                destination = coldDestination;
            } else {
                destination = 'Cape Town';
            }

            console.log(`You should take a cruise to ${destination}`);
        }

        function decideTrip() {
            let weatherQuestion = new Input({message: `What type of weather do you prefer for your vacation? \n 1) Warm \n 2) Cold \n Enter number 1 or 2:`});
            weatherQuestion.run().then(function (response) {
                let weatherResponseString = getWeatherResponseString(response);
                // if feature enabled
                if (optimizelyClientInstance.isFeatureEnabled('cruise_option', userId())) {
                    let landOrSea = new Input({message: `Do you want your next trip to be by land or by sea? \n Respond 1 if by land and 2 if by sea.`});
                    landOrSea.run().then(function (response) {
                        // only send them on a cruise if they choose to vacation by sea
                        if (parseInt(response) === 2) {
                            optimizelyClientInstance.track('bysea', userId(), attributes);
                            suggestCruise(weatherResponseString);
                        } else {
                            optimizelyClientInstance.track('byland', userId(), attributes);
                            suggestTrip(weatherResponseString);
                        }
                    });
                } else {
                    suggestTrip(weatherResponseString);
                }
            });
        }
    });
});