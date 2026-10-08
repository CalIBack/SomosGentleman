<?php
// config/config.php

// Zona horaria del negocio. XAMPP trae Europe/Berlin por defecto en su php.ini:
// sin esto, date() y time() van 5 hs adelantados y todo el control de turnos
// pasados de la agenda falla. Fijarlo en código hace que funcione igual en
// cualquier servidor, sin depender de su configuración.
date_default_timezone_set('America/Argentina/Buenos_Aires');

define('DBUSER', 'root'); 
define('DBPASS', '');
define('DBBASE', 'gentleman_db'); 
define('DBHOST', 'localhost');

// Clave Secreta de JSON Web Token (JWT) adaptada para la marca
define('JWT_SECRET', 'elproferobaenlosrecreos40minutosderecreomamitaqueridaencimavolvemosyseponeahacerjueguitosenelpizarron');
define('JWT_EXPIRATION_TIME', 86400); 
define('RECARGO_SASTRERIA', 30000);
// Límites del editor de lookbooks. La API los valida; el frontend usa los mismos valores.
define('LOOKBOOK_ANCHO_MAX', 4);   // ancho de una foto en cuartos del álbum: 4 = 100%
define('LOOKBOOK_ALTO_MAX', 4);    // alto de una foto en filas
define('LOOKBOOK_MAX_FOTOS', 40);


function sf__restablecerSql () {
    $rutaDump = __DIR__ . '/../adicional/dump.sql';
    return file_get_contents($rutaDump);
}
?>