import Castv2Client from "castv2-client";
import { promisify } from "util";

const Client = Castv2Client.Client;
export const DefaultMediaReceiver = Castv2Client.DefaultMediaReceiver;

export class PlayerWrapper {
  private base: any;

  constructor(base: any) {
    this.base = base;
  }

  public on = (event: "status", callback: (...args: any[]) => void) => {
    this.base.on(event, callback);
  };

  public load = (media: any, options: any) => {
    return promisify(this.base.bind(this.base))(media, options);
  };
}

export class ChromecastWrapper {
  private client: any;

  constructor() {
    this.client = new Client();
  }

  public connect = (host: string) =>
    promisify(this.client.connect.bind(this.client))(host);

  public close = () => this.client.close();

  public getStatus = () => promisify(this.client.getStatus.bind(this.client))();

  public getSessions = () =>
    promisify(this.client.getSessions.bind(this.client))();

  public getAppAvailability = () =>
    promisify(this.client.getAppAvailability.bind(this.client))();

  public join = () => promisify(this.client.join.bind(this.client))();

  public launch = async (...args: any[]) => {
    const res = await promisify(this.client.launch.bind(this.client))(...args);
    return new PlayerWrapper(res);
  };

  public stop = (...args: any[]) =>
    promisify(this.client.stop.bind(this.client))(...args);

  public setVolume = (vol: number) =>
    promisify(this.client.setVolume.bind(this.client))(vol);

  public getVolume = () => promisify(this.client.getVolume.bind(this.client))();
}
