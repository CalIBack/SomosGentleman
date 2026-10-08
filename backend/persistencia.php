<?php
// backend/persistencia.php

require_once(__DIR__.'/../config/config.php');

function conectarBD()
{
    $link = mysqli_connect(DBHOST, DBUSER, DBPASS);
    if ($link === false) {
        outputError(500, "Falló la conexión: " . mysqli_connect_error());
    }
    
    mysqli_set_charset($link, 'utf8mb4');

    // Crea la BD si no existe y define el charset
    $link->query("CREATE DATABASE IF NOT EXISTS ".DBBASE." CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
    $link->select_db(DBBASE);
    
    return $link;
}

function outputJson($data, $codigo = 200)
{
    header('', true, $codigo);
    header('Content-type: application/json');
    print json_encode($data);
    exit;
}

function getJsonData()
{
    $json = file_get_contents('php://input');
    return json_decode($json, true);
}

function outputError($codigo = 500, $mensaje = null)
{
    $default_message = "Error interno del servidor.";
    
    switch ($codigo) {
        case 400:
            header($_SERVER["SERVER_PROTOCOL"] . " 400 Bad Request", true, 400);
            $default_message = "Solicitud incorrecta. Revise los parametros enviados.";
            break;
        case 404:
            header($_SERVER["SERVER_PROTOCOL"] . " 404 Not Found", true, 404);
            $default_message = "Recurso no encontrado.";
            break;
        // Puedes agregar el resto de tus casos (401, 403, etc.) aquí
        default:
            header($_SERVER["SERVER_PROTOCOL"] . " 500 Internal Server Error", true, 500);
            break;
    }

    header('Content-Type: application/json');
    echo json_encode([
        "error_code" => $codigo,
        "message" => $mensaje ?? $default_message 
    ]);
    exit;
}
?>