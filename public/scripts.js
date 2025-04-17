let inputTimeout;

// const easternConf = ["ATL", "BOS", "BRK", "CHA", "CHI", "CLE", "DET", "IND", "MIA", "MIL", "NYK", "ORL", "PHI", "TOR", "WAS"];
// const westernConf = ["DAL", "DEN", "GSW", "HOU", "LAC", "LAL", "MEM", "MIN", "NOP", "OKC", "PHX", "POR", "SAC", "SAS", "UTA"];
// const allTeams = [...easternConf, ...westernConf];

function getGraphTitle() {
    const playerName = document.getElementById("playerNameInput").value;
    const seasonYear = document.getElementById("seasonDropdown").value.slice(0, 4);
    const selectedStat = getSelectedStat();
    const homeAwayFilter = document.getElementById("locationDropdown").value;
    const homeAwayText = homeAwayFilter === "all" ? "" : `(${homeAwayFilter.charAt(0).toUpperCase() + homeAwayFilter.slice(1)})`;
    const teamFilter = document.getElementById("teamDropdown").value;
    const teamText = teamFilter === "all" ? "" : `(vs. ${teamFilter})`;
    
    const statText = {
        "PTS": "Points",
        "AST": "Assists",
        "REB": "Rebounds",
        "STL": "Steals",
        "BLK": "Blocks"
    };
    const selectedStatText = statText[selectedStat];

    return `${playerName} - ${seasonYear}-${(parseInt(seasonYear) + 1).toString().slice(-2)} ${selectedStatText} ${homeAwayText} ${teamText}`;
}

function getSelectedStat() {
    const selectedRadio = document.querySelector('input[name="stat"]:checked');
    return selectedRadio.value;
}

function handlePlayerInput() {
    clearTimeout(inputTimeout);
    fetchPlayerSuggestions();

    inputTimeout = setTimeout(() => {
        loadSeasons();
    }, 1000); // delay to reduce redundant fetches
}

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

// Load seasons for a selected player
async function loadSeasons() {
    const playerName = document.getElementById("playerNameInput").value;
    const dropdown = document.getElementById("seasonDropdown");

    if (!playerName.trim()) return;

    dropdown.style.display = "none";
    dropdown.innerHTML = "<option>Loading...</option>";

    try {
        const res = await fetch(`http://localhost:5000/player-seasons?name=${encodeURIComponent(playerName)}`);
        const seasons = await res.json();

        if (res.status !== 200 || seasons.length === 0) {
            dropdown.innerHTML = "";
            dropdown.style.display = "none";
            return;
        }

        dropdown.innerHTML = "";
        seasons.forEach(season => {
            const option = document.createElement("option");
            option.value = season;
            option.textContent = season;
            dropdown.appendChild(option);
        });

        dropdown.style.display = "inline-block";

        const defaultSeason = "2024-25";
        if (seasons.includes(defaultSeason)) {
            dropdown.value = defaultSeason;
        } else {
            dropdown.selectedIndex = 0;
        }

        fetchPlayerStats(); // ← always call this here
    } catch (err) {
        console.error("Error fetching seasons:", err);
        dropdown.style.display = "none";
    }
}

async function fetchPlayerStats() {
    const playerName = document.getElementById("playerNameInput").value;
    const seasonYear = document.getElementById("seasonDropdown").value.slice(0, 4);
    const selectedStat = getSelectedStat();

    const homeAwayFilter = document.getElementById("locationDropdown").value;
    const teamFilter = document.getElementById("teamDropdown").value;
    // let teamFilterList = allTeams;
    // if (teamFilter !== "all") {
    //     if (teamFilter === "Eastern") {
    //         teamFilterList = easternConf;
    //     } else if (teamFilter === "Western") {
    //         teamFilterList = westernConf;
    //     } else {
    //         teamFilterList = [teamFilter];
    //     }
    // }

    const resultFilter = document.getElementById("resultDropdown").value;

    const url = `http://localhost:5000/player-games?name=${encodeURIComponent(playerName)}&season=${encodeURIComponent(seasonYear)}`;
    const outputDiv = document.getElementById("output");
    outputDiv.innerText = "Loading...";

    try {
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        });

        if (res.status === 404) {
            outputDiv.innerText = "Player not found. Please check the name and try again.";
            return;
        } else if (res.status === 400) {
            outputDiv.innerText = "Invalid request. Please check the input values.";
            return;
        } else if (!res.ok) {
            outputDiv.innerText = "Error fetching data. Please try again later.";
            return;
        }

        const data = await res.json();

        if (data.error) {
            alert(data.error);
            outputDiv.innerText = "No data found.";
            return;
        }

        const filtered = data.filter(d => {
            const gameDate = new Date(d.GAME_DATE);
            const startDate = new Date(`${seasonYear}-10-01`); // Start of the season
            const endDate = new Date(`${seasonYear + 1}-04-30`); // End of the season
            return gameDate >= startDate && gameDate <= endDate;
        });

        if (filtered.length === 0) {
            outputDiv.innerText = "No data found for the specified player and season.";
            return;
        }

        const locationExpr = homeAwayFilter === "all"
            ? "true"
            : homeAwayFilter === "home"
                ? `indexof(datum.MATCHUP, 'vs.') !== -1`
                : `indexof(datum.MATCHUP, '@') !== -1`;        
        
        // const teamExpr = teamFilterList.length === 0
        //     ? "true"
        //     : teamFilterList
        //         .map(team => `indexof(datum.MATCHUP, '${team}') !== -1`)
        //         .join(" || ");

        const teamExpr = teamFilter === "all"
            ? "true"
            : `indexof(datum.MATCHUP, '${teamFilter}') !== -1`;

        const resultExpr = resultFilter === "all"
            ? "true"
            : resultFilter === "W"
                ? `datum.WL === 'W'`
                : `datum.WL === 'L'`;

        const testExpr = `${locationExpr} && ${teamExpr} && ${resultExpr}`;

        const spec = {
            "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
            "data": { "values": filtered },
            "mark": "bar",
            "width": 800,
            "height": 400,
            "title": {
                "text": getGraphTitle(),
                "anchor": "center",
                "fontSize": 20,
                "fontWeight": "bold",
                "dy": -10
            },
            "encoding": {
                "x": {
                    "field": "GAME_DATE",
                    "type": "temporal",
                    "title": "Game Date"
                }, "y": {
                    "field": selectedStat,
                    "type": "quantitative",
                    "title": "Points",
                    "axis": { "grid": true, "format": "d" }
                }, "color": {
                    "condition": {
                        "test": testExpr,
                        "value": "steelblue"
                    },
                    "value": "lightgray"
                },"tooltip": [
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
        };

        vegaEmbed("#vis", spec);
        outputDiv.innerText = "";
    } catch (err) {
        console.error("Fetch error:", err);
        document.getElementById("output").innerText = "Error fetching data. Check console.";
    }
}

window.onload = () => {
    document.getElementById("playerNameInput").value = "LeBron James"; // or any default player
    document.getElementById("seasonDropdown").addEventListener("change", fetchPlayerStats);
    document.getElementById("statSelection").addEventListener("change", fetchPlayerStats);
    document.getElementById("locationDropdown").addEventListener("change", fetchPlayerStats);
    document.getElementById("teamDropdown").addEventListener("change", fetchPlayerStats);
    document.getElementById("resultDropdown").addEventListener("change", fetchPlayerStats);

    handlePlayerInput();
}