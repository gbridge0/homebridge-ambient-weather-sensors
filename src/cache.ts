import { Logger } from 'homebridge';

import fs from 'fs';

export class Cache {

  private valid = false;
  private cache_data = {
    cache_time: Date.now(),
    ttl: this.ttl,
    data: [],
  };

  constructor(
    public readonly CacheFile: string,
    public readonly ttl: number,
    public readonly log: Logger,
  ) {
    this.CacheFile = CacheFile;
  }

  write(data) {
    this.log.debug('----- Writing API response to disk cache -----');
    const cache = {
      cache_time: Date.now(),
      ttl: this.ttl,
      data: data,
    };

    try {
      this.cache_data = cache;
      fs.writeFileSync(this.CacheFile, JSON.stringify(cache));
    } catch (error) {
      let message;
      if (error instanceof Error) {
        message = error.message;
      } else {
        message = String(error);
      }
      throw new Error(message);
    }
  }

  read() {
    this.log.debug('Reading API response from cache');

    try {
      if (this.cache_data !== undefined) {
        return this.cache_data;
      }

      this.log.debug('Reading API response from DISK cache');
      const data = fs.readFileSync(this.CacheFile, 'utf8');
      const json = JSON.parse(data);
      this.cache_data = json;
      return json;

    } catch (error) {
      let message;
      if (error instanceof Error) {
        message = error.message;
      } else {
        message = String(error);
      }
      throw new Error(message);
    }
  }

  isValid() {
    fs.access(this.CacheFile, fs.constants.F_OK | fs.constants.W_OK, (err) => {
      if (!err) {
        const cache = this.read();
        const now = Date.now();
        // use dynamic TTL
        this.valid = now - cache.cache_time < this.ttl;
      }
    });

    return this.valid;
  }
}