import { AdapterActionResult } from "~/adapter.js";
import { InterpreterAction } from "~/interpreter.js";
import { unixTimestamp } from "~/util.js";
import { Action, AdapterInterfaceRunActionData } from "./index.js";
import { getWeatherConfig } from "~/config/weather.js";
import { URLSearchParams } from "url";
import { getPrometheusGauge } from "~/prometheus.js";

export class AdapterWeather {
  private actions: Action[] = [];

  public initialise = async () => {
    const weatherConfig = await getWeatherConfig();

    console.log("[AdapterWeather/initialise] Started");

    this.actions.push({
      type: "command",
      id: "get_weather_temperature",
      description: "Gets the temperature",
      handler: this.handlerFetchWeatherTemperature,
      parameters: [
        {
          name: "location",
          description: "Location we are fetching the weather from.",
          type: "string",
          enum: weatherConfig.locations.map((location) => location.name),
        },
      ],
    });
  };

  public handlerFetchWeatherTemperature = async (
    payload: AdapterInterfaceRunActionData<{
      location?: string;
    }>
  ): Promise<AdapterActionResult> => {
    console.log(
      `[AdapterWeather/handlerFetchWeatherTemperature] Fetching weather, location ${payload.parameters.location}`
    );

    if (!payload.toolId) {
      throw new Error("Tool ID not set");
    }

    const weatherConfig = await getWeatherConfig();

    const location = weatherConfig.locations.find(
      (item) =>
        item.name === payload.parameters.location ??
        weatherConfig.defaultLocation
    );

    if (!location) {
      throw new Error(
        "Unable to find location, " + payload.parameters.location
      );
    }

    const results = await getPrometheusGauge(
      location.connector.gauge,
      location.connector.series
    );

    const result = results.find(
      (item) => item.metric.__name__ === location.connector.gauge
    );

    if (!result) {
      return {
        success: false,
        results: [],
      };
    }

    return {
      success: true,
      results: [
        {
          type: "interpreter-tool-message",
          toolId: payload.toolId,
          message: `Weather is ${result.value.data} degrees in ${payload.parameters.location}`,
        },
        {
          type: "interpreter-evaluate",
        },
      ],
    };
  };

  public runAction = async (payload: AdapterInterfaceRunActionData) => {
    for (const action of this.actions) {
      if (action.id === payload.id) {
        return await action.handler(payload);
      }
    }

    return null;
  };

  public getInterpreterActions = async (): Promise<InterpreterAction[]> => {
    return this.actions
      .filter((action) => action.type === "command")
      .map((action) => {
        return {
          id: action.id,
          description: action.description,
          parameters: action.parameters,
        };
      });
  };
}
