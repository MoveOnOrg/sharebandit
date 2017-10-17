# Caching Layer

If you expect traffic for ~1 million shares for a single url or more than ~300k clicks/actions per hour,
then we recommend enabling our Redis caching layer.

Some important notes:

* Redis >= `2.8.9` is required. (because we use HyperLogLog commands `PFADD` and `PFCOUNT`)

* Counts for shares and successes are stored with HyperLogLog
  algorithm which creates a % error of ~1.08%.  This should be more
  than usable for the purposes of the bandit algorithm

* The caching layer does both reads AND writes. Writes do not sync
  until a cron sync process is run.  The cached writes immediately
  effect responses for the bandit algorithm, but they will not get
  sync'd to the database until the sync process runs. This has two
  consequences:
  * The admin graphs represent what is synced to the database, not Redis
  * If Redis is restarted then the data after the last sync is lost

* Provision your caching storage appropriately knowing that it saves writes.
  Writes scale to # of shares with probably about ~20bytes per share,
  so if you expect 1 million shares per hour, and you sync every 5 minutes,
  then that suggests around ~2Mb for writes (along with other active metadata
  which is probably around 1-5Mb or so).

* Part of syncing clears cache for old keys and data, to maintain a low caching
  footprint. Unprocessed writes are not cleared but metadata for trials refreshes
  every hour and bandit-algorithm share counts expire 1 day after last use.
  

## Setup

### Setup the config:

Your config file should have the following key:

```json
  "redisStore": {
    "prefix": "SHAREBANDIT-",
    "host": "YOURREDISSERVER.abc123.0001.usw1.cache.amazonaws.com",
    "port": 6379
  }
```

### Setting up the sync process

If you are running on a traditional server, then you should create a cronjob that runs every minute
or so `npm run cronjob` in the sharebandit directory

If you are running on Amazon's AWS Lambda platform, then you should create a CloudWatch Event
or Lambda "Trigger" calling your lambda function with the following event object:

```
{ "command": "processDataIncrementally" }
```

