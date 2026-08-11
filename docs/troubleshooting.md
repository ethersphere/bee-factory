# Troubleshooting

If your problem is not covered here, please report it at
[github.com/ethersphere/bee-factory/issues](https://github.com/ethersphere/bee-factory/issues).

## `connect EACCES /var/run/docker.sock`

On a freshly installed Linux (e.g. Ubuntu), `bee-factory start` may fail with:

```
Fatal error: Error: connect EACCES /var/run/docker.sock
```

This means your user is not in the `docker` group yet and therefore cannot talk to the Docker daemon socket. Add it:

```sh
sudo usermod -aG docker $USER
newgrp docker
```

If you get `Command 'newgrp' not found, but can be installed with: sudo apt install util-linux-extra`, install it and re-run `newgrp docker`:

```sh
sudo apt install util-linux-extra
newgrp docker
```

Then verify that Docker works without `sudo`:

```sh
docker run hello-world
```

If Docker responds, you are good to go with `bee-factory start`.
