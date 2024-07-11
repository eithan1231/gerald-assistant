import { URLSearchParams } from "url";
import { ConfigurationOptions, getConfigOption } from "./config/env.js";

export type PrometheusGaugeData = Array<{
  metric: {
    __name__: string;
    instance: string;
    job: string;
    [name: string]: string;
  };
  value: {
    time: number;
    data: string;
  };
}>;

export const getPrometheusGauge = async (
  gauge: string,
  series: Record<string, string>
): Promise<PrometheusGaugeData> => {
  const seriesFilter = Object.keys(series)
    .map((item) => `${item}=${JSON.stringify(series[item])}`)
    .join(",");

  const query = `${gauge}{${seriesFilter}}`;

  const queryString = new URLSearchParams({
    query,
  });

  let url = `${getConfigOption(
    ConfigurationOptions.EndpointPrometheus
  )}/api/v1/query?${queryString.toString()}`;

  const response = await fetch(url);

  const responseData = await response.json();

  if (responseData.status !== "success") {
    throw new Error(
      `Expected status of "success", got "${responseData.status}"`
    );
  }

  if (responseData?.data?.resultType !== "vector") {
    console.log(responseData.data);

    throw new Error(
      "Expected resultType to be vector " + responseData.data.resultType
    );
  }

  return responseData.data.result.map((item: any): PrometheusGaugeData[0] => {
    return {
      metric: item.metric,
      value: {
        time: Math.round(item.value[0]),
        data: item.value[1],
      },
    };
  });
};
