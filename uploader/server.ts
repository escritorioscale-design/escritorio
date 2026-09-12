import App from "./src/App";

const httpPort = Number.parseInt(process.env.HTTP_PORT ?? "8080", 10);

App.listen(httpPort, () => {
  console.log(`WorkAdventure uploader starting on port ${httpPort}!`);
});

export {};
