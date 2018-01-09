# Release Notes

## v1.1.0

* Implements option for using a Redis caching layer, closing issue [30](https://github.com/MoveOnOrg/sharebandit/issues/30). We recommend this option when expecting more than ~1 million shares for a single url or more than ~300k clicks/actions per hour. See [docs/CACHING.md](https://github.com/MoveOnOrg/sharebandit/blob/master/docs/CACHING.md) for configuration instuctions.
* Fixes session bugs in issues [60](https://github.com/MoveOnOrg/sharebandit/issues/60) and [64](https://github.com/MoveOnOrg/sharebandit/issues/64).
* Adds cron job to clear facebook cache of stale URL metadata and assigns treatments to sharebandit-ified URLs missing treatment id, closing issue [54](https://github.com/MoveOnOrg/sharebandit/issues/54).
* Adds API to fetch information on variants, closing issue [40](https://github.com/MoveOnOrg/sharebandit/issues/40).
* Adds option for using a different AdminAuth module than google auth, closing issue [36](https://github.com/MoveOnOrg/sharebandit/issues/36).
* Adds button to scrape page metadata from treatment URLs, closing issue [41](https://github.com/MoveOnOrg/sharebandit/issues/41).
* Corrects db config keys for sequelize, closing issue [35](https://github.com/MoveOnOrg/sharebandit/issues/35).