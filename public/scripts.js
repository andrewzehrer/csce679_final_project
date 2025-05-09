let inputTimeout;
let data_filtered;

/**
 * Mapping of stat codes to their display names
 */
const statText = {
    "PTS": "Points",
    "AST": "Assists",
    "REB": "Rebounds",
    "STL": "Steals",
    "BLK": "Blocks"
};

/**
 * Creates title for the visualization based on current filters
 * @returns {string} Formatted title string
 */
function getGraphTitle() {
    const playerName = document.getElementById("playerNameInput").value;
    const seasonYear = document.getElementById("seasonDropdown").value.slice(0, 4);
    const selectedStat = getSelectedStat();

    const homeAwayFilter = document.getElementById("locationDropdown").value;
    const teamFilter = document.getElementById("teamDropdown").value;
    const winLossFilter = document.getElementById("resultDropdown").value;

    const parts = [
        `${playerName}`,
        `- ${seasonYear}-${(parseInt(seasonYear) + 1).toString().slice(-2)}`,
        statText[selectedStat],
        homeAwayFilter !== "all" ? `(${capitalize(homeAwayFilter)})` : "",
        teamFilter !== "all" ? `(vs. ${teamFilter})` : "",
        winLossFilter !== "all" ? `(${winLossFilter === "W" ? "Wins" : "Losses"})` : ""
    ];

    // Join parts with a space and remove extra spaces
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Gets the currently selected stat from the radio buttons
 * @returns {string} Selected stat code (PTS, AST, REB, STL, or BLK)
 */
function getSelectedStat() {
    const selectedRadio = document.querySelector('input[name="stat"]:checked');
    return selectedRadio.value;
}

/**
 * Handles user input and triggers player suggestions immediately but delays bio and season loading
 */
function handleUserInput() {
    clearTimeout(inputTimeout);
    fetchPlayerSuggestions();

    inputTimeout = setTimeout(() => {
        loadPlayerBio();
        loadSeasons();
    }, 1000); // delay to reduce redundant fetches
}

/**
 * Fetches player name suggestions for autocomplete based on current input
 * Updates the datalist with matching player names
 */
async function fetchPlayerSuggestions() {
    const input = document.getElementById("playerNameInput");
    const datalist = document.getElementById("playerSuggestions");
    const query = input.value;

    if (!query.trim()) {
        datalist.innerHTML = ""; // Clear suggestions if input is empty
        return;
    }

    try {
        const res = await fetch(`http://localhost:5000/player-suggestions?query=${encodeURIComponent(query)}`);
        const suggestions = await res.json();

        // Populate the datalist with suggestions
        datalist.innerHTML = "";
        suggestions.forEach(player => {
            const option = document.createElement("option");
            option.value = player; // Set the value to the player's name
            datalist.appendChild(option);
        });
    } catch (err) {
        console.error("Error fetching player suggestions:", err);
    }
}

/**
 * Loads available seasons for the selected player
 */
async function loadSeasons() {
    const playerName = document.getElementById("playerNameInput").value;
    const dropdown = document.getElementById("seasonDropdown");
    dropdown.innerHTML = "";

    // if no name, exit
    if (!playerName.trim()) return;

    try {
        // Fetch seasons from the backend
        const res = await fetch(`http://localhost:5000/player-seasons?name=${encodeURIComponent(playerName)}`);
        const seasons = await res.json();

        // Check if the response is valid and seasons are available
        if (res.status !== 200 || seasons.length === 0) {
            return;
        }

        // Populate the dropdown with seasons
        seasons.forEach(season => {
            const option = document.createElement("option");
            option.value = season;
            option.textContent = season;
            dropdown.appendChild(option);
        });

        // Set it to the most recent season
        dropdown.selectedIndex = 0;

        fetchPlayerStats(); // always call this here
    } catch (err) {
        console.error("Error fetching seasons:", err);
    }
}

/**
 * Loads and displays player portrait, team logo, and personal details
 */
async function loadPlayerBio() {
    const playerName = document.getElementById("playerNameInput").value;
    const bioDiv = document.getElementById("bio");

    if (!playerName.trim()) return;
    
    try {
        const res = await fetch(`http://localhost:5000/player-bio?name=${encodeURIComponent(playerName)}`);
        const bio = await res.json();

        if (res.status !== 200 || !bio) {
            bioDiv.innerHTML = "No data found.";
            return;
        }

        // Portrait and team logo
        document.getElementById("player-portrait").src = bio.portrait_url;
        document.getElementById("bio").style.backgroundImage = `url('${bio.team_logo_url}')`;

        // have to caluclate age from birthdate
        const birthdate = new Date(bio.birthdate);
        const today = new Date();
        const age = Math.floor((today - birthdate) / (1000 * 60 * 60 * 24 * 365)); 

        // format the birthdate to MM/DD/YYYY
        const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
        const birthdateString = birthdate.toLocaleDateString('en-US', options);
        const birthdateParts = birthdateString.split('/');
        const formattedBirthdate = `${birthdateParts[0]}/${birthdateParts[1]}/${birthdateParts[2]}`;

        // Populate bio information
        document.getElementById("player-name").textContent = bio.name;
        document.getElementById("player-birthdate").textContent = `${formattedBirthdate} (Age ${age})`;
        document.getElementById("player-height").textContent = bio.height;
        document.getElementById("player-weight").textContent = bio.weight;
        document.getElementById("player-school").textContent = bio.school;
        document.getElementById("player-exp").textContent = bio.experience;
    } catch (err) {
        console.error("Error fetching player bio:", err);
        bioDiv.innerHTML = "Error loading player bio.";
    }
}

/**
 * Main function to fetch player game statistics from the backend
 * Retrieves game-by-game data for the selected player and season
 * Filters data to the appropriate season range and triggers visualization updates
 */
async function fetchPlayerStats() {
    // Get input values from the UI
    const playerName = document.getElementById("playerNameInput").value;
    const seasonYear = document.getElementById("seasonDropdown").value.slice(0, 4);
    const url = `http://localhost:5000/player-games?name=${encodeURIComponent(playerName)}&season=${encodeURIComponent(seasonYear)}`;

    // Fetch data from the backend
    try {
        const res = await fetch(url, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        });

        const data = await res.json();

        if (data.error) {
            alert(data.error);
            console.log("No data found.");
            return;
        }

        // Filter and process the data
        const filtered = data.filter(d => {
            const gameDate = new Date(d.GAME_DATE);
            const startDate = new Date(`${seasonYear}-10-01`); // Start of the season
            const endDate = new Date(`${seasonYear + 1}-04-30`); // End of the season
            return gameDate >= startDate && gameDate <= endDate;
        });

        // Check if filtered data is empty
        if (filtered.length === 0) {
            console.log("No data found for the specified player and season.");
            return;
        }

        // Sort by date
        filtered.sort((a, b) => new Date(a.GAME_DATE) - new Date(b.GAME_DATE));

        // Store the filtered data as global variable
        data_filtered = filtered; 
    } catch (err) {
        console.error("Fetch error:", err);
    }

    updateGraph(data_filtered); 
}

/**
 * Updates all visualizations based on the current filtered data and UI selections
 * Creates bar chart, rolling averages, box plot, and histogram
 * Also updates the statistics summary table
 * @param {Array} data_filtered - Array of filtered game data objects
 */
async function updateGraph(data_filtered) {
    if (!data_filtered) return;

    // Get input values and filters from the UI
    const playerName = document.getElementById("playerNameInput").value;
    const seasonYear = document.getElementById("seasonDropdown").value.slice(0, 4);
    const homeAwayFilter = document.getElementById("locationDropdown").value;
    const teamFilter = document.getElementById("teamDropdown").value;
    const resultFilter = document.getElementById("resultDropdown").value;
    const showSeasonAvg = document.getElementById("showSeasonAvg").checked;
    const showRollingAvg = document.getElementById("showRollingAvg").checked;
    const selectedStat = getSelectedStat();

    // Filter data for totals table and charts
    const passesFilters = (d) => {
        const isLocationOk = homeAwayFilter === "all"
            || (homeAwayFilter === "home" && d.MATCHUP.indexOf('vs.') !== -1)
            || (homeAwayFilter === "away" && d.MATCHUP.indexOf('@') !== -1);

        const isTeamOk = teamFilter === "all"
            || d.MATCHUP.indexOf(teamFilter) !== -1;

        const isResultOk = resultFilter === "all"
            || (resultFilter === "W" && d.WL === 'W')
            || (resultFilter === "L" && d.WL === 'L');

        return isLocationOk && isTeamOk && isResultOk;
    };

    // Convert to Vega-Lite filter expressions
    const locationExpr = homeAwayFilter === "all"
        ? "true"
        : homeAwayFilter === "home"
            ? `indexof(datum.MATCHUP, 'vs.') !== -1`
            : `indexof(datum.MATCHUP, '@') !== -1`;

    const teamExpr = teamFilter === "all"
        ? "true"
        : `indexof(datum.MATCHUP, '${teamFilter}') !== -1`;

    const resultExpr = resultFilter === "all"
        ? "true"
        : resultFilter === "W"
            ? `datum.WL === 'W'`
            : `datum.WL === 'L'`;

    const testExpr = `${locationExpr} && ${teamExpr} && ${resultExpr}`;

    // Initialize chart layers
    const activeSeries = [];
    const colors = [];

    if (showSeasonAvg) {
        activeSeries.push("Season Avg");
        colors.push("green");
    }

    if (showRollingAvg) {
        activeSeries.push("5-game Avg");
        colors.push("orangered");
    }

    const showLegend = activeSeries.length > 0;

    const layers = [
        { // Bar chart (always shown)
            "data": { "values": data_filtered },
            "mark": "bar",
            "encoding": {
                "x": { 
                    "field": "GAME_DATE", 
                    "type": "temporal", 
                    "title": "Game Date",
                    "axis": { 
                        "labelAngle": -45, 
                        "orient": "bottom",
                        "format": "%b %e"
                    }
                },
                "y": { 
                    "field": selectedStat,
                    "type": "quantitative",
                    "axis": { 
                        "title": statText[selectedStat],
                        "orient": "left"
                    }
                },
                "color": {
                    "condition": { 
                        "test": testExpr, 
                        "value": "steelblue" 
                    },
                    "value": "lightgray"
                },
                "tooltip": [
                    { "field": "GAME_DATE", "type": "temporal", "title": "Game Date" },
                    { "field": "MATCHUP", "type": "nominal", "title": "Matchup" },
                    { "field": "WL", "type": "nominal", "title": "Win/Loss" },
                    { "field": "PTS", "type": "quantitative", "title": "Points" },
                    { "field": "AST", "type": "quantitative", "title": "Assists" },
                    { "field": "REB", "type": "quantitative", "title": "Rebounds" },
                    { "field": "STL", "type": "quantitative", "title": "Steals" },
                    { "field": "BLK", "type": "quantitative", "title": "Blocks" }
                ]
            }
        }
    ];

    // Calculate season average
    let seasonAverage = 0;
    data_filtered.forEach(d => { seasonAverage += d[selectedStat]; });
    seasonAverage = (seasonAverage / data_filtered.length).toFixed(2);

    // Add Season Average line (if shown)
    if (showSeasonAvg) {
        const avgLineData = data_filtered.map(d => ({
            GAME_DATE: d.GAME_DATE,
            value: seasonAverage,
            series: "Season Avg"
        }));

        layers.push({
            "data": { "values": avgLineData },
            "mark": { 
                "type": "line", 
                "strokeWidth": 2, 
                "strokeDash": [4, 2]
            },
            "encoding": {
                "x": { 
                    "field": "GAME_DATE", 
                    "type": "temporal",
                    "axis": { "format": "%b %e" }
                },
                "y": { 
                    "field": "value", 
                    "type": "quantitative",
                    "axis": { "orient": "left", "title": "" }
                },
                "color": {
                    "field": "series",
                    "type": "nominal",
                    "scale": { "domain": activeSeries, "range": colors },
                    "legend": showLegend ? { "title": "Legend" } : null
                },
                "tooltip": [
                    {
                        "field": "value", 
                        "type": "quantitative", 
                        "title": `Season Avg ${selectedStat}` 
                    }
                ]
            }
        });
    }

    // Calculate rolling 5-game averages
    const rollingStats = data_filtered.map((d, i) => {
        const start = Math.max(0, i - 4);
        const window = data_filtered.slice(start, i + 1);
        const values = window.map(g => g[selectedStat]);
        const avg = values.reduce((sum, v) => sum + v, 0) / values.length;

        return { GAME_DATE: d.GAME_DATE, avg: avg };
    });

    // Add Rolling 5-game Average line (if shown)
    if (showRollingAvg) {
        layers.push({
            "data": { "values": rollingStats.map(d => ({...d, series: "5-game Avg"})) },
            "mark": { 
                "type": "line", 
                "strokeWidth": 2, 
                "point": true
            },
            "encoding": {
                "x": { 
                    "field": "GAME_DATE", 
                    "type": "temporal",
                    "axis": { "format": "%b %e" }
                },
                "y": { 
                    "field": "avg", 
                    "type": "quantitative",
                    "axis": { "orient": "left", "title": "" }
                },
                "color": {
                    "field": "series",
                    "type": "nominal",
                    "scale": { "domain": activeSeries, "range": colors },
                    "legend": showLegend ? { "title": "Legend" } : null
                },
                "tooltip": [
                    { 
                        "field": "GAME_DATE",
                        "type": "temporal",
                        "title": "Game Date" 
                    },
                    { 
                        "field": "avg",
                        "type": "quantitative",
                        "title": `Avg ${selectedStat} last 5 games`
                    }
                ]
            }
        });
    }

    const spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "title": {
            "text": getGraphTitle(),
            "anchor": "center",
            "fontSize": 20,
            "fontWeight": "bold",
            "dy": -10
        },
        "autosize": { 
            "type": "fit",
            "resize": true,
            "contains": "padding"
        },
        "padding": 20,
        "width": "container",
        "height": "container",
        "layer": layers
    };

    vegaEmbed("#vis", spec);

    // Display table totals
    const filteredForTotals = data_filtered.filter(passesFilters);
    const totals = { 
        "PTS": 0, 
        "AST": 0, 
        "REB": 0, 
        "STL": 0, 
        "BLK": 0 
    };

    // apply testExpr to filtered data
    filteredForTotals.forEach(d => {
        totals.PTS += d.PTS;
        totals.AST += d.AST;
        totals.REB += d.REB;
        totals.STL += d.STL;
        totals.BLK += d.BLK;
    });

    // divide by games played
    const gamesPlayed = filteredForTotals.length;
    if (gamesPlayed > 0) {
        for (const key in totals) {
            totals[key] = (totals[key] / gamesPlayed).toFixed(2);
        }
    } else {
        for (const key in totals) {
            totals[key] = "0.00";
        }
    }

    document.getElementById("tableHeader").innerText = "Games Played: " + gamesPlayed;
    document.getElementById("ptsPerGame").innerText = totals.PTS;
    document.getElementById("astPerGame").innerText = totals.AST;
    document.getElementById("rebPerGame").innerText = totals.REB;
    document.getElementById("stlPerGame").innerText = totals.STL;
    document.getElementById("blkPerGame").innerText = totals.BLK;

    // calculate standard deviation of each stat
    const stats = ["PTS", "AST", "REB", "STL", "BLK"];
    const stdDevs = {};

    stats.forEach(stat => {
        const mean = totals[stat];
        const variance = filteredForTotals.reduce((acc, d) => {
            return acc + Math.pow(d[stat] - mean, 2);
        }, 0) / gamesPlayed;
        stdDevs[stat] = Math.sqrt(variance).toFixed(2);
    });

    document.getElementById("ptsStdDev").innerText = stdDevs.PTS;
    document.getElementById("astStdDev").innerText = stdDevs.AST;
    document.getElementById("rebStdDev").innerText = stdDevs.REB;
    document.getElementById("stlStdDev").innerText = stdDevs.STL;
    document.getElementById("blkStdDev").innerText = stdDevs.BLK;

    // Generate box plot
    const boxPlotData = data_filtered.map(d => ({ [selectedStat]: d[selectedStat] }));
    const boxPlotSpec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "title": {
            "text": `${playerName} - ${seasonYear}-${(parseInt(seasonYear) + 1).toString().slice(-2)} ${statText[selectedStat]} Box Plot`,
            "anchor": "center",
            "fontSize": 20,
            "fontWeight": "bold",
            "dy": -10
        },
        "autosize": { 
            "type": "fit",
            "resize": true,
            "contains": "padding"
        },
        "padding": 20,
        "width": "container",
        "height": "container",
        "data": { "values": boxPlotData },
        "mark": {
            "type": "boxplot",
            "extent": 1.5,
            "outliers": true,
            "size": 50,
            "ticks": true
        },
        "encoding": {
            "x": { 
                "field": selectedStat, 
                "type": "quantitative", 
                "title": statText[selectedStat],
                "axis": { "format": "d" }
            },
            "color": { "value": "steelblue" },
            "tooltip": [
                { 
                    "field": selectedStat, 
                    "type": "quantitative", 
                    "title": selectedStat 
                }
            ]
        }
    };

    vegaEmbed("#boxPlot", boxPlotSpec);

    // Generate histogram 
    const histogramData = data_filtered.map(d => ({ [selectedStat]: d[selectedStat] }));
    histogramData.sort((a, b) => a[selectedStat] - b[selectedStat]);

    // If selectedstat = steals or blocks, make the bins size 1, else 5
    const binSize = (selectedStat === "STL" || selectedStat === "BLK") ? 1 : 5; 
    
    const histogramSpec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "title": {
            "text": `${playerName} - ${seasonYear}-${(parseInt(seasonYear) + 1).toString().slice(-2)} ${statText[selectedStat]} Histogram`,
            "anchor": "center",
            "fontSize": 20,
            "fontWeight": "bold",
            "dy": -10
        },
        "autosize": { 
            "type": "fit",
            "resize": true,
            "contains": "padding"
        },
        "padding": 20,
        "width": "container",
        "height": "container",
        "data": { "values": histogramData },
        "mark": { "type": "bar", "tooltip": true },
        "encoding": {
            "x": { 
                "field": selectedStat, 
                "type": "quantitative", 
                "bin": { "step": binSize }, 
                "title": statText[selectedStat],
                "axis": { "format": "d" }
            },
            "y": { 
                "aggregate": 'count', 
                "type": 'quantitative', 
                "title": 'Count' 
            },
            "color": { "value": "steelblue" },
            "tooltip": [
                {
                    "field": selectedStat,
                    "bin": { "step": binSize },
                    "type": "quantitative",
                    "title": selectedStat
                },
                {
                    "aggregate": "count",
                    "type": "quantitative",
                    "title": "Count"
                }
            ]
        }
    };

    vegaEmbed("#histogram", histogramSpec);
}

/**
 * Initialize the application when the page loads
 * Set up event listeners and loads initial data
 */
window.onload = () => {
    fetchPlayerStats();

    document.getElementById("playerNameInput").addEventListener("input", () => {
        handleUserInput();
    });

    document.getElementById("seasonDropdown").addEventListener("change", () => {
        fetchPlayerStats();
    });

    document.getElementById("inputDiv").addEventListener("change", () => {
        updateGraph(data_filtered);
    });

    handleUserInput();
}