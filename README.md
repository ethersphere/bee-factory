# Bee Factory

[![Tests](https://github.com/ethersphere/bee-factory/actions/workflows/tests.yaml/badge.svg)](https://github.com/ethersphere/bee-factory/actions/workflows/tests.yaml)
[![Dependency Status](https://david-dm.org/ethersphere/bee-factory.svg?style=flat-square)](https://david-dm.org/ethersphere/bee-factory)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fethersphere%2Fbee-factory.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2Fethersphere%2Fbee-factory?ref=badge_shield)
[![](https://img.shields.io/badge/made%20by-Swarm-blue.svg?style=flat-square)](https://swarm.ethereum.org/)
[![standard-readme compliant](https://img.shields.io/badge/standard--readme-OK-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/feross/standard)
![](https://img.shields.io/badge/npm-%3E%3D6.9.0-orange.svg?style=flat-square)
![](https://img.shields.io/badge/Node.js-%3E%3D12.0.0-orange.svg?style=flat-square)

> CLI tool to spin up Docker cluster of Bee nodes for advanced testing and/or development

**Warning: This project is in beta state. There might (and most probably will) be changes in the future to its API and working. Also, no guarantees can be made about its stability, efficiency, and security at this stage.**

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Contribute](#contribute)
- [License](#license)

## Install

**Requirements:** Docker

```shell
$ npm install -g @ethersphere/bee-factory
```

## Usage

```shell
# This spin up the cluster and exits
$ bee-factory start --detach 1.2.0 1.5.1-d0a77598-stateful

# This attaches to the Queen container and displays its logs
$ bee-factory logs queen

# This stops the cluster and keeping the containers so next time they are spinned up the data are kept
# but data are not persisted across version's bump!
$ bee-factory stop

# You can also spin up the cluster without the --detach which then directly
# attaches to the Queen logs and the cluster is terminated upon SIGINT (Ctrl+C)
$ bee-factory start 1.2.0 1.5.1-d0a77598-stateful
```

For more details see the `--help` page of the CLI and its commands.

## Contribute

There are some ways you can make this module better:

- Consult our [open issues](https://github.com/ethersphere/bee-factory/issues) and take on one of them
- Help our tests reach 100% coverage!
- Join us in our [Discord chat](https://discord.gg/wdghaQsGq5) in the #develop-on-swarm channel if you have questions or want to give feedback

### Developing

You can run the CLI while developing using `npm start -- <command> ...`.

## Maintainers

- [auhau](https://github.com/auhau)
- [Cafe137](https://github.com/cafe137)

## License

[BSD-3-Clause](./LICENSE)


[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fethersphere%2Fbee-factory.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fethersphere%2Fbee-factory?ref=badge_large)
