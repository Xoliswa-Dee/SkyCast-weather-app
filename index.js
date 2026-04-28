import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = 3000;

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

const API_KEY = process.env.API_KEY;

app.get("/", (req, res) => {
  res.render("index", { 
    weather: null, 
    error: null,
 });
});

app.post("/weather", async (req, res) => {
  const city = req.body.city;

  try {
    const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city},ZA&appid=${API_KEY}&units=metric`);

    res.render("index", {
        weather: response.data,
        error: null,
    });
  }catch (error) {
    console.log(error.response?.data || error.message);

    console.log("API KEY:", process.env.API_KEY); 
    res.render("index", {
        weather: null,
        error: "City not found. Try again." ,
    });
  }
  });

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
