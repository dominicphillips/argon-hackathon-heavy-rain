# Describe your use of Google products to build the submitted project:

We built Heavy Rain's live prototype builder on the Gemini API using the Google Gen AI Python SDK. When an operator submits a workflow brief in Relay, our backend calls the Interactions API to launch the managed Antigravity coding agent with Gemini models in a Google-hosted remote sandbox. While the agent works in the background, Relay follows interaction updates and uses the Environments API to list and download the generated HTML, CSS, SVG, and JSON files into local storage for human review as a self-contained sample-data prototype.

We also use the Gemini API to summarize builder steps into plain-language progress lines, and we used Gemini models to draft our system design and prompt specifications. Talos, our broader workflow evaluation and decision layer, is a work in progress; the submitted demo focuses on brief-to-prototype building.
