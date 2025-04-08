async function fetchPlayerStats() {
    const playerName = document.getElementById("playerNameInput").value;
    const seasonYear = document.getElementById("seasonInput").value;
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

        const spec = {
            "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
            "data": { "values": filtered },
            "mark": "bar",
            "encoding": {
                "x": {
                    "field": "GAME_DATE",
                    "type": "temporal",
                    "title": "Game Date"
                }, "y": {
                    "field": "PTS",
                    "type": "quantitative",
                    "title": "Points",
                    "axis": { "grid": true }
                }, "tooltip": [
                    { "field": "GAME_DATE", "type": "temporal", "title": "Game Date" },
                    { "field": "PTS", "type": "quantitative", "title": "Points" },
                    { "field": "AST", "type": "quantitative", "title": "Assists" },
                    { "field": "REB", "type": "quantitative", "title": "Rebounds" }
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

window.onload = () => fetchPlayerStats();