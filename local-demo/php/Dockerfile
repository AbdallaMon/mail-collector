FROM php:8.3-cli
RUN docker-php-ext-install -j2 mysqli
WORKDIR /srv
CMD ["php", "-S", "0.0.0.0:8080", "-t", "/srv/public", "/srv/router.php"]
