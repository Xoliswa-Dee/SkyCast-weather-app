
/*
 * SKYCAST WEATHER APP
 * -------------------
 * This file runs the server, retrieves current weather from OpenWeather,
 * retrieves a seven-day forecast from Open-Meteo, and sends the data
 * to our EJS webpage so it can be displayed to the user.
 */

// Import Express to create and manage our web server.
import express from "express";

// Import Axios to make HTTP requests to weather APIs.
import axios from "axios";

// Import dotenv to read environment variables from our .env file.
import dotenv from "dotenv";

// Load the variables stored in .env into process.env.
dotenv.config();

// Create our Express application.
const app = express();

// The port is the number used to access our local server.
const port = 3000;

// Serve static files, such as CSS, from the public folder.
// For example, public/styles.css is accessible at /styles.css.
app.use(express.static("public"));

// Allow Express to read form data submitted by our HTML form.
// For example, the city entered in the search box.
app.use(express.urlencoded({ extended: true }));

// Tell Express that we use EJS to generate our HTML pages.
app.set("view engine", "ejs");

// Read the OpenWeather API key from the .env file.
// Keeping the key in .env prevents us from writing it directly in our code.
const API_KEY = process.env.API_KEY;


/*
 * FUNCTION: getWeatherInfo()
 * --------------------------
 * Open-Meteo returns a weather code instead of a text description.
 * This function converts that code into an emoji and readable description.
 *
 * Example:
 * Code 0 becomes "Clear sky" with a sunny icon.
 *
 * The function returns an object containing the icon and description.
 */
function getWeatherInfo(code) {
  // Clear and cloudy conditions.
  if (code === 0) return { icon: "☀️", description: "Clear sky" };
  if (code === 1) return { icon: "🌤️", description: "Mainly clear" };
  if (code === 2) return { icon: "⛅", description: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", description: "Overcast" };

  // Fog conditions.
  if ([45, 48].includes(code)) {
    return { icon: "🌫️", description: "Foggy" };
  }

  // Drizzle and freezing drizzle.
  if ([51, 53, 55, 56, 57].includes(code)) {
    return { icon: "🌦️", description: "Drizzle" };
  }

  // Rain and freezing rain.
  if ([61, 63, 65, 66, 67].includes(code)) {
    return { icon: "🌧️", description: "Rain" };
  }

  // Snow and snow showers.
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { icon: "🌨️", description: "Snow" };
  }

  // Rain showers.
  if ([80, 81, 82].includes(code)) {
    return { icon: "🌦️", description: "Rain showers" };
  }

  // Thunderstorms, with or without hail.
  if ([95, 96, 99].includes(code)) {
    return { icon: "⛈️", description: "Thunderstorm" };
  }

  // Fallback for any weather code not listed above.
  return { icon: "🌡️", description: "Variable conditions" };
}


/*
 * ROUTE 1: GET /
 * --------------
 * This route displays the homepage when someone visits:
 * http://localhost:3000
 *
 * No weather has been searched for yet, so we pass null for weather
 * and forecast. The EJS template uses these values to decide what to show.
 */
app.get("/", (req, res) => {
  res.render("index", {
    weather: null,
    forecast: null,
    searchedCity: "",
    error: null
  });
});


/*
 * ROUTE 2: POST /weather
 * ----------------------
 * This route runs when the user submits the city search form.
 *
 * It performs these steps:
 * 1. Read the city entered by the user.
 * 2. Retrieve current weather from OpenWeather.
 * 3. Find the city's latitude and longitude using Open-Meteo geocoding.
 * 4. Retrieve the seven-day forecast from Open-Meteo.
 * 5. Send the results to the EJS template.
 */
app.post("/weather", async (req, res) => {

  // Get the city from the submitted form and remove extra spaces.
  // The ?. operator prevents an error if req.body.city is missing.
  const city = req.body.city?.trim();

  // Do not make API requests if the search box is empty.
  if (!city) {
    return res.render("index", {
      weather: null,
      forecast: null,
      searchedCity: "",
      error: "Please enter a city name."
    });
  }

  try {
    /*
     * STEP 1: GET CURRENT WEATHER
     * ---------------------------
     * Axios sends a GET request to the OpenWeather current-weather API.
     *
     * q: city name, followed by ZA to search South Africa.
     * appid: our API key.
     * units: metric means temperatures are in Celsius.
     *
     * await pauses this function until the API responds.
     * The response.data property contains the actual weather information.
     */
    const currentResponse = await axios.get(
      "https://api.openweathermap.org/data/2.5/weather",
      {
        params: {
          q: `${city},ZA`,
          appid: API_KEY,
          units: "metric"
        }
      }
    );

    // Store the current weather data in a shorter, easier-to-use variable.
    const weather = currentResponse.data;


    /*
     * STEP 2: FIND THE CITY'S COORDINATES
     * ----------------------------------
     * Open-Meteo's geocoding API converts a city name into coordinates.
     *
     * Latitude identifies the north/south position.
     * Longitude identifies the east/west position.
     *
     * The forecast API needs these coordinates to know which location
     * to generate the forecast for.
     */
    const locationResponse = await axios.get(
      "https://geocoding-api.open-meteo.com/v1/search",
      {
        params: {
          name: city,
          count: 10,
          language: "en",
          format: "json"
        }
      }
    );

    // The API returns an array of matching locations.
    // If results is missing, use an empty array instead.
    const locations = locationResponse.data.results || [];

    // Prefer a South African match because our current-weather search
    // also uses ZA. If none is found, use the first available match.
    const location =
      locations.find((item) => item.country_code === "ZA") ||
      locations[0];

    // Stop if geocoding did not find any matching city.
    if (!location) {
      throw new Error("Could not find forecast coordinates for this city.");
    }


    /*
     * STEP 3: GET THE SEVEN-DAY FORECAST
     * ---------------------------------
     * Use the latitude and longitude found in Step 2.
     *
     * daily:
     *   weather_code        = weather conditions for each day
     *   temperature_2m_max  = daily maximum temperature
     *   temperature_2m_min  = daily minimum temperature
     *
     * forecast_days: 7 asks for seven calendar days.
     * timezone: auto uses the location's local timezone for the dates.
     */
    const forecastResponse = await axios.get(
      "https://api.open-meteo.com/v1/forecast",
      {
        params: {
          latitude: location.latitude,
          longitude: location.longitude,
          daily: "weather_code,temperature_2m_max,temperature_2m_min",
          forecast_days: 7,
          timezone: "auto"
        }
      }
    );

    // Store the daily forecast information.
    const daily = forecastResponse.data.daily;


    /*
     * STEP 4: PREPARE THE FORECAST FOR OUR WEBPAGE
     * --------------------------------------------
     * The API returns separate arrays for dates, weather codes,
     * maximum temperatures and minimum temperatures.
     *
     * .map() combines the values at the same index into one object
     * for each day. This makes displaying the forecast in EJS easier.
     */
    const forecast = daily.time.map((date, index) => ({

      // The date returned by Open-Meteo, in YYYY-MM-DD format.
      date,

      // Convert the date into a short weekday name, such as Mon or Tue.
      // Using midday UTC avoids crossing a date boundary during formatting.
      day: new Intl.DateTimeFormat("en-ZA", {
        weekday: "short",
        timeZone: "UTC"
      }).format(new Date(`${date}T12:00:00Z`)),

      // Convert the numeric weather code into an emoji and description.
      ...getWeatherInfo(daily.weather_code[index]),

      // Round the forecast temperatures to whole degrees Celsius.
      max: Math.round(daily.temperature_2m_max[index]),
      min: Math.round(daily.temperature_2m_min[index])
    }));


    /*
     * STEP 5: DISPLAY THE RESULTS
     * ---------------------------
     * res.render() opens the index.ejs template and passes it the data.
     *
     * weather: current conditions from OpenWeather.
     * forecast: seven days of forecast data from Open-Meteo.
     * searchedCity: keeps the city name in the search box.
     * error: null means there is no error message to display.
     */
    res.render("index", {
      weather,
      forecast,
      searchedCity: city,
      error: null
    });

  } catch (error) {

    /*
     * ERROR HANDLING
     * --------------
     * If an API request fails, log the details in the terminal.
     * This helps us troubleshoot without displaying technical details
     * or sensitive information to the user.
     */
    console.error(
      "Weather lookup failed:",
      error.response?.data || error.message
    );

    // Use a general message unless we can identify a specific problem.
    let message = "Unable to retrieve weather. Please try again.";

    // HTTP 404 usually indicates that OpenWeather could not find the city.
    if (error.response?.status === 404) {
      message = "City not found. Check the spelling and try again.";
    }

    // HTTP 401 indicates an authentication problem with the API key.
    else if (error.response?.status === 401) {
      message = "Your OpenWeather API key was rejected. Check your .env file.";
    }

    // Render the page again with an error message instead of crashing.
    res.render("index", {
      weather: null,
      forecast: null,
      searchedCity: city,
      error: message
    });
  }
});


/*
 * START THE SERVER
 * ----------------
 * Start listening for browser requests on port 3000.
 * The message appears in the terminal when the server starts.
 */
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
