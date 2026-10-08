<?php
// backend/api.php

header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Headers: X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Request-Method, Authorization");
header('Access-Control-Allow-Methods: POST, GET, PATCH, DELETE, OPTIONS');
header("Allow: GET, POST, PATCH, DELETE, OPTIONS");

// Manejo de peticiones preflight (CORS)
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once(__DIR__.'/../config/config.php');
require_once(__DIR__.'/../vendor/autoload.php'); // Dependencias de Composer

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

if (!isset($_GET['accion'])) {
    outputError(400, "Acción no especificada en la URL.");
}

$metodo = strtolower($_SERVER['REQUEST_METHOD']);
$accion = explode('/', strtolower($_GET['accion']));
$funcionNombre = $metodo . ucfirst($accion[0]);
$parametros = array_slice($accion, 1);

if (function_exists($funcionNombre)) {
    call_user_func_array($funcionNombre, $parametros);
} else {
    outputError(501, "El endpoint '$funcionNombre' no está implementado.");
}

// ==========================================
// FUNCIONES DE UTILIDAD Y JWT
// ==========================================

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
    switch ($codigo) {
        case 400: header($_SERVER["SERVER_PROTOCOL"] . " 400 Bad Request", true, 400); $default_message = "Solicitud incorrecta."; break;
        case 401: header($_SERVER["SERVER_PROTOCOL"] . " 401 Unauthorized", true, 401); $default_message = "Acceso no autorizado."; break;
        case 403: header($_SERVER["SERVER_PROTOCOL"] . " 403 Forbidden", true, 403); $default_message = "Acceso denegado. Permisos insuficientes."; break;
        case 404: header($_SERVER["SERVER_PROTOCOL"] . " 404 Not Found", true, 404); $default_message = "Recurso no encontrado."; break;
        case 409: header($_SERVER["SERVER_PROTOCOL"] . " 409 Conflict", true, 409); $default_message = "Conflicto de recursos."; break;
        case 501: header($_SERVER["SERVER_PROTOCOL"] . " 501 Not Implemented", true, 501); $default_message = "No implementado."; break;
        default:  header($_SERVER["SERVER_PROTOCOL"] . " 500 Internal Server Error", true, 500); $default_message = "Error interno."; break;
    }
    header('Content-Type: application/json');
    echo json_encode(["error_code" => $codigo, "message" => $mensaje ?? $default_message]);
    die;
}

function conectarBD()
{
    $link = mysqli_connect(DBHOST, DBUSER, DBPASS);
    if ($link === false) outputError(500, "Falló la conexión a MySQL.");
    mysqli_set_charset($link, 'utf8mb4');
    $link->query("CREATE DATABASE IF NOT EXISTS ".DBBASE." CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
    $link->select_db(DBBASE);
    return $link;
}

function postRestablecer()
{
    verificarRol(['admin']);

    $db = conectarBD();
    $sql = sf__restablecerSql();
    $result = mysqli_multi_query($db, $sql);
    if ($result === false) outputError(500, "Error al procesar el archivo SQL.");
    do { if ($res = mysqli_store_result($db)) mysqli_free_result($res); } while (mysqli_more_results($db) && mysqli_next_result($db));
    mysqli_close($db);
    outputJson(["mensaje" => "Base de datos restablecida a su estado inicial"], 201);
}

// ------------------- MOTOR JWT FIREBASE -------------------

function generarJWT($payload) {
    return JWT::encode($payload, JWT_SECRET, 'HS256');
}

function validarJWT() {
    $headers = apache_request_headers();
    $authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : (isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '');
    
    if (!$authHeader || !preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        outputError(401, "Token no proporcionado o formato inválido.");
    }
    
    $jwt = $matches[1];

    try {
        $decoded = JWT::decode($jwt, new Key(JWT_SECRET, 'HS256'));
        return (array) $decoded;
    } catch (\Firebase\JWT\ExpiredException $e) {
        outputError(401, "El token ha expirado. Inicia sesión nuevamente.");
    } catch (Exception $e) {
        outputError(401, "Token inválido o corrupto.");
    }
}

function verificarRol($rolesPermitidos) {
    $datosUsuario = validarJWT();
    if (!in_array($datosUsuario['rol'], $rolesPermitidos)) {
        outputError(403, "No tienes permisos suficientes para esta acción.");
    }
    return $datosUsuario;
}

function validarPertenencia($db, $tabla, $columnaUsuario, $registroId, $usuarioActivo) {
    $idSafe = mysqli_real_escape_string($db, $registroId);
    $check = mysqli_query($db, "SELECT $columnaUsuario FROM $tabla WHERE id = $idSafe");
    
    if (mysqli_num_rows($check) > 0) {
        $fila = mysqli_fetch_assoc($check);
        
        // Si el usuario NO es admin, comprobamos estrictamente que sea el dueño
        if ($usuarioActivo['rol'] !== 'admin' && (int)$fila[$columnaUsuario] !== (int)$usuarioActivo['id']) {
            mysqli_free_result($check);
            mysqli_close($db);
            outputError(403, "Acceso denegado. Este registro no te pertenece.");
        }
    } else {
        mysqli_free_result($check);
        mysqli_close($db);
        outputError(404, "Registro no encontrado.");
    }
    mysqli_free_result($check);
}

// ==========================================
// ENDPOINT: LOGIN & UPLOAD
// ==========================================

function postLogin()
{
    $db = conectarBD();
    $datos = getJsonData();

    if (empty($datos['email']) || empty($datos['password'])) {
        mysqli_close($db);
        outputError(400, "Email y contraseña son obligatorios.");
    }

    $email = mysqli_real_escape_string($db, trim($datos['email']));
    $passwordIngresado = trim($datos['password']);

    $sql = "SELECT id, nombre_completo, email, password, rol FROM usuarios WHERE email = '$email'";
    $result = mysqli_query($db, $sql);
    
    if (mysqli_num_rows($result) === 0) {
        mysqli_free_result($result);
        mysqli_close($db);
        outputError(401, "Credenciales incorrectas.");
    }

    $usuario = mysqli_fetch_assoc($result);
    mysqli_free_result($result);
    mysqli_close($db);

    if (!password_verify($passwordIngresado, $usuario['password'])) {
        outputError(401, "Credenciales incorrectas.");
    }

    $payload = [
        'id' => (int)$usuario['id'],
        'nombre' => $usuario['nombre_completo'],
        'email' => $usuario['email'],
        'rol' => $usuario['rol'],
        'iat' => time(),
        'exp' => time() + JWT_EXPIRATION_TIME
    ];

    $token = generarJWT($payload);

    outputJson([
        "mensaje" => "Login exitoso",
        "token" => $token,
        "usuario" => [
            "id" => $usuario['id'],
            "nombre" => $usuario['nombre_completo'],
            "rol" => $usuario['rol']
        ]
    ], 200);
}

function postUpload()
{
    verificarRol(['admin', 'cliente']); 

    if (!isset($_FILES['imagen'])) {
        outputError(400, "No se recibió ninguna imagen en el campo 'imagen'.");
    }

    $archivo = $_FILES['imagen'];

    // Límite de tamaño del archivo recibido antes de procesar nada
    $limiteBytes = 15 * 1024 * 1024; // 15 MB
    if ($archivo['size'] > $limiteBytes) {
        outputError(400, "La imagen supera el tamaño máximo permitido (15 MB).");
    }

    // Validamos el contenido real del archivo, no solo la extensión del nombre
    $info = @getimagesize($archivo['tmp_name']);
    if ($info === false) {
        outputError(400, "El archivo no es una imagen válida.");
    }

    $mimesPermitidos = [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/webp' => 'webp',
    ];

    if (!isset($mimesPermitidos[$info['mime']])) {
        outputError(400, "Formato no permitido. Solo se aceptan: " . implode(', ', array_values($mimesPermitidos)));
    }

    $extension = $mimesPermitidos[$info['mime']];

    switch ($info['mime']) {
        case 'image/jpeg': $origen = imagecreatefromjpeg($archivo['tmp_name']); break;
        case 'image/png':  $origen = imagecreatefrompng($archivo['tmp_name']); break;
        case 'image/webp': $origen = imagecreatefromwebp($archivo['tmp_name']); break;
    }

    if ($origen === false) {
        outputError(400, "No se pudo procesar la imagen.");
    }

    // Las fotos de celular guardan la orientación en los metadatos EXIF en vez
    // de rotar los píxeles. GD ignora ese dato, así que una foto vertical quedaría
    // acostada. La enderezamos acá, antes de guardar, para que el archivo final
    // ya tenga la orientación correcta (y el lookbook calcule bien si es vertical).
    if ($info['mime'] === 'image/jpeg' && function_exists('exif_read_data')) {
        $exif = @exif_read_data($archivo['tmp_name']);
        $orientacion = isset($exif['Orientation']) ? (int)$exif['Orientation'] : 1;
        $angulos = [3 => 180, 6 => -90, 8 => 90];
        if (isset($angulos[$orientacion])) {
            $rotada = imagerotate($origen, $angulos[$orientacion], 0);
            if ($rotada !== false) {
                imagedestroy($origen);
                $origen = $rotada;
            }
        }
    }

    // Redimensionamos si excede el ancho máximo, para no depender de lo que suba el usuario
    $anchoMaximo = 1600;
    $anchoOriginal = imagesx($origen);
    $altoOriginal = imagesy($origen);

    if ($anchoOriginal > $anchoMaximo) {
        $altoNuevo = (int) (($anchoMaximo / $anchoOriginal) * $altoOriginal);
        $destino = imagecreatetruecolor($anchoMaximo, $altoNuevo);

        if ($info['mime'] === 'image/png') {
            imagealphablending($destino, false);
            imagesavealpha($destino, true);
        }

        imagecopyresampled($destino, $origen, 0, 0, 0, 0, $anchoMaximo, $altoNuevo, $anchoOriginal, $altoOriginal);
        imagedestroy($origen);
    } else {
        $destino = $origen;
    }

    $directorio = __DIR__ . '/../uploads/';
    if (!file_exists($directorio)) {
        mkdir($directorio, 0777, true);
    }

    $nombreUnico = uniqid('img_') . '.' . $extension;
    $rutaDestino = $directorio . $nombreUnico;

    switch ($info['mime']) {
        case 'image/jpeg': $guardado = imagejpeg($destino, $rutaDestino, 80); break;
        case 'image/png':  $guardado = imagepng($destino, $rutaDestino, 6); break;
        case 'image/webp': $guardado = imagewebp($destino, $rutaDestino, 80); break;
        default: $guardado = false;
    }

    // Medidas finales: el editor de lookbooks las usa para decidir si la foto
    // arranca vertical (1x2), apaisada (2x1) o cuadrada (1x1)
    $anchoFinal = imagesx($destino);
    $altoFinal = imagesy($destino);
    imagedestroy($destino);

    if ($guardado) {
        outputJson([
            "mensaje" => "Imagen subida con éxito",
            "ruta" => "uploads/" . $nombreUnico,
            "ancho" => $anchoFinal,
            "alto" => $altoFinal
        ], 201);
    } else {
        outputError(500, "Error al guardar el archivo en el servidor.");
    }
}

// ==========================================
// ENDPOINTS: PRODUCTOS
// ==========================================

function getProductos($id = null)
{
    $db = conectarBD();
    $whereSql = '';
    if (!empty($id)) {
        $idSafe = mysqli_real_escape_string($db, $id);
        $whereSql = "WHERE id = $idSafe";
    }

    $sql = "SELECT * FROM productos $whereSql";
    $result = mysqli_query($db, $sql);
    $ret = [];
    
    while ($fila = mysqli_fetch_assoc($result)) {
        settype($fila['id'], 'int');
        settype($fila['precio'], 'float');
        settype($fila['variante_destacada'], 'bool');
        
        $fila['imagenes'] = isset($fila['imagenes']) ? json_decode($fila['imagenes'], true) : [];
        
        // Optimización: Consultar stock solo si se pide un producto específico
        
        $stockSql = "SELECT id, talle, stock FROM productos_stock WHERE producto_id = " . $fila['id'];
        $stockResult = mysqli_query($db, $stockSql);
        $stock = [];
        while ($stockFila = mysqli_fetch_assoc($stockResult)) {
            settype($stockFila['id'], 'int');
            settype($stockFila['stock'], 'int');
            $stock[] = $stockFila;
        }
        mysqli_free_result($stockResult);
            
        $fila['variaciones_stock'] = $stock;

        $ret[] = $fila;
    }
    mysqli_free_result($result);
    mysqli_close($db);
    
    if ($id !== null) {
        if (empty($ret)) outputError(404, "El producto no existe.");
        outputJson($ret[0]);
    } else outputJson($ret);
}

function postProductos()
{
    verificarRol(['admin']);

    $db = conectarBD();
    $datos = getJsonData();

    if (empty($datos['nombre']) || empty($datos['precio']) || empty($datos['categoria']) || empty($datos['modelo'])) {
        mysqli_close($db); outputError(400, "Faltan campos obligatorios (nombre, precio, categoria, modelo).");
    }

    $nombre = mysqli_real_escape_string($db, trim($datos['nombre']));
    $precio = (float) $datos['precio'];
    $categoria = mysqli_real_escape_string($db, trim($datos['categoria']));
    $modelo = mysqli_real_escape_string($db, trim($datos['modelo']));
    
    $descripcion = isset($datos['descripcion']) ? "'" . mysqli_real_escape_string($db, trim($datos['descripcion'])) . "'" : "NULL";
    $detalle = isset($datos['detalle']) ? "'" . mysqli_real_escape_string($db, trim($datos['detalle'])) . "'" : "''";
    $imagen_portada = isset($datos['imagen_portada']) ? "'" . mysqli_real_escape_string($db, trim($datos['imagen_portada'])) . "'" : "'1.png'";
    
    $subcategoria = isset($datos['subcategoria']) ? "'" . mysqli_real_escape_string($db, trim($datos['subcategoria'])) . "'" : "''";
    $varianteDestacada = (isset($datos['variante_destacada']) && $datos['variante_destacada']) ? 1 : 0;
    $descuento = isset($datos['descuento']) ? "'" . mysqli_real_escape_string($db, trim($datos['descuento'])) . "'" : "''";

    $imagenesJson = "NULL";
    if (isset($datos['imagenes']) && is_array($datos['imagenes'])) {
        $imagenesJson = "'" . mysqli_real_escape_string($db, json_encode($datos['imagenes'])) . "'";
    }

    $sql = "INSERT INTO productos (nombre, descripcion, precio, descuento, categoria, subcategoria, modelo, detalle, variante_destacada, imagen_portada, imagenes) 
        VALUES ('$nombre', $descripcion, $precio, $descuento, '$categoria', $subcategoria, '$modelo', $detalle, $varianteDestacada, $imagen_portada, $imagenesJson)";
    
    mysqli_query($db, $sql);
    $productoId = mysqli_insert_id($db);

    if (isset($datos['variaciones_stock']) && is_array($datos['variaciones_stock']) && !empty($datos['variaciones_stock'])) {
        foreach ($datos['variaciones_stock'] as $variacion) {
            $talleVar = isset($variacion['talle']) ? mysqli_real_escape_string($db, trim($variacion['talle'])) : 'Único';
            $stockVar = isset($variacion['stock']) ? (int) $variacion['stock'] : 0;
            mysqli_query($db, "INSERT INTO productos_stock (producto_id, talle, stock) VALUES ($productoId, '$talleVar', $stockVar)");
        }
    } else {
        mysqli_query($db, "INSERT INTO productos_stock (producto_id, talle, stock) VALUES ($productoId, 'Único', 0)");
    }

    mysqli_close($db);
    outputJson(["id" => $productoId, "mensaje" => "Producto creado con éxito"], 201);
}

function patchProductos($id)
{
    verificarRol(['admin']);

    $db = conectarBD();
    $idSafe = mysqli_real_escape_string($db, $id);
    $datos = getJsonData();

    $updates = [];
    
    if (isset($datos['nombre'])) $updates[] = "nombre='" . mysqli_real_escape_string($db, trim($datos['nombre'])) . "'";
    if (isset($datos['descripcion'])) $updates[] = "descripcion='" . mysqli_real_escape_string($db, trim($datos['descripcion'])) . "'";
    if (isset($datos['precio'])) $updates[] = "precio=" . (float) $datos['precio'];
    if (isset($datos['categoria'])) $updates[] = "categoria='" . mysqli_real_escape_string($db, trim($datos['categoria'])) . "'";
    if (isset($datos['modelo'])) $updates[] = "modelo='" . mysqli_real_escape_string($db, trim($datos['modelo'])) . "'";
    if (isset($datos['detalle'])) $updates[] = "detalle='" . mysqli_real_escape_string($db, trim($datos['detalle'])) . "'";
    if (isset($datos['imagen_portada'])) $updates[] = "imagen_portada='" . mysqli_real_escape_string($db, trim($datos['imagen_portada'])) . "'";
    
    if (isset($datos['subcategoria'])) $updates[] = "subcategoria='" . mysqli_real_escape_string($db, trim($datos['subcategoria'])) . "'";
    if (isset($datos['variante_destacada'])) $updates[] = "variante_destacada=" . ((bool)$datos['variante_destacada'] ? 1 : 0);
    if (isset($datos['descuento'])) $updates[] = "descuento='" . mysqli_real_escape_string($db, trim($datos['descuento'])) . "'";

    if (isset($datos['imagenes']) && is_array($datos['imagenes'])) {
        $updates[] = "imagenes='" . mysqli_real_escape_string($db, json_encode($datos['imagenes'])) . "'";
    }

    if (!empty($updates)) {
        mysqli_query($db, "UPDATE productos SET " . implode(', ', $updates) . " WHERE id=$idSafe");
    }
    
    mysqli_close($db);
    outputJson(['id' => (int)$id, 'mensaje' => 'Producto actualizado'], 200);
}

function deleteProductos($id)
{
    verificarRol(['admin']);

    $db = conectarBD();
    $idSafe = mysqli_real_escape_string($db, $id);
    mysqli_query($db, "DELETE FROM productos WHERE id=$idSafe");
    mysqli_close($db);
    outputJson(["mensaje" => "Producto eliminado con éxito"], 200);
}

// ==========================================
// ENDPOINTS: STOCK
// ==========================================

function getStock($id = null)
{
    verificarRol(['admin']);
    $db = conectarBD();

    $whereSql = '';
    if (!empty($id)) {
        if ($id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }
        $idSafe = mysqli_real_escape_string($db, $id);
        $whereSql = "WHERE id = $idSafe";
    }

    $sql = "SELECT id, producto_id, talle, stock FROM productos_stock $whereSql";
    $result = mysqli_query($db, $sql);
    $ret = [];
    while ($fila = mysqli_fetch_assoc($result)) {
        settype($fila['id'], 'int');
        settype($fila['producto_id'], 'int');
        settype($fila['stock'], 'int');
        $ret[] = $fila;
    }
    mysqli_free_result($result);
    mysqli_close($db);

    if ($id !== null) {
        if (empty($ret)) outputError(404, "La variante de stock no existe.");
        outputJson($ret[0]);
    } else outputJson($ret);
}

function postStock()
{
    verificarRol(['admin']);

    $db = conectarBD();
    $datos = getJsonData();

    if (empty($datos['producto_id'])) {
        mysqli_close($db); outputError(400, "El producto_id es obligatorio.");
    }

    $productoId = (int) $datos['producto_id'];
    $check = mysqli_query($db, "SELECT id FROM productos WHERE id = $productoId");
    if (mysqli_num_rows($check) === 0) {
        mysqli_free_result($check);
        mysqli_close($db); outputError(404, "El producto ID $productoId no existe.");
    }
    mysqli_free_result($check);

    $talle = isset($datos['talle']) ? mysqli_real_escape_string($db, trim($datos['talle'])) : 'Único';
    $stock = isset($datos['stock']) ? (int) $datos['stock'] : 0;

    mysqli_query($db, "INSERT INTO productos_stock (producto_id, talle, stock) VALUES ($productoId, '$talle', $stock)");
    $stockId = mysqli_insert_id($db);
    mysqli_close($db);

    outputJson(["id" => $stockId, "mensaje" => "Variante de stock creada"], 201);
}

function patchStock($id)
{
    verificarRol(['admin']);

    $db = conectarBD();
    if (empty($id) || $id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }
    $idSafe = mysqli_real_escape_string($db, $id);
    $datos = getJsonData();

    $check = mysqli_query($db, "SELECT id FROM productos_stock WHERE id = $idSafe");
    if (mysqli_num_rows($check) === 0) {
        mysqli_free_result($check);
        mysqli_close($db); outputError(404, "La variante de stock no existe.");
    }
    mysqli_free_result($check);

    $updates = [];
    if (isset($datos['talle'])) $updates[] = "talle='" . mysqli_real_escape_string($db, trim($datos['talle'])) . "'";
    if (isset($datos['stock'])) $updates[] = "stock=" . (int) $datos['stock'];

    if (!empty($updates)) {
        mysqli_query($db, "UPDATE productos_stock SET " . implode(', ', $updates) . " WHERE id=$idSafe");
    }
    mysqli_close($db);
    outputJson(['id' => (int)$id, 'mensaje' => 'Variante de stock actualizada'], 200);
}

function deleteStock($id)
{
    verificarRol(['admin']);
    $db = conectarBD();
    if (empty($id) || $id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }
    $idSafe = mysqli_real_escape_string($db, $id);

    // Igual criterio que con pedidos: si esta variante ya fue pedida alguna vez,
    // no se borra (rompería la trazabilidad de pedidos viejos), se pone en 0.
    $check = mysqli_query($db, "SELECT id FROM pedidos WHERE FIND_IN_SET($idSafe, REPLACE(detalles, '####', ',')) > 0 LIMIT 1");
    if (mysqli_num_rows($check) > 0) {
        mysqli_free_result($check);
        mysqli_close($db);
        outputError(409, "Esta variante de stock está referenciada en al menos un pedido y no puede eliminarse. Si ya no la vendés, ponele stock=0 en vez de borrarla.");
    }
    mysqli_free_result($check);

    mysqli_query($db, "DELETE FROM productos_stock WHERE id=$idSafe");
    mysqli_close($db);
    outputJson(["mensaje" => "Variante de stock eliminada"], 200);
}

// ==========================================
// ENDPOINTS: USUARIOS
// ==========================================

function getUsuarios($id = null)
{
    verificarRol(['admin']); 

    $db = conectarBD();
    $whereSql = '';
    if (!empty($id)) $whereSql = "WHERE id = " . mysqli_real_escape_string($db, $id);

    $sql = "SELECT id, nombre_completo, email, rol, foto_perfil, fecha_registro FROM usuarios $whereSql";
    $result = mysqli_query($db, $sql);
    $ret = [];
    while ($fila = mysqli_fetch_assoc($result)) {
        settype($fila['id'], 'int');
        $ret[] = $fila;
    }
    mysqli_close($db);
    
    if ($id !== null) {
        if (empty($ret)) outputError(404, "El usuario no existe.");
        outputJson($ret[0]);
    } else outputJson($ret);
}

function postUsuarios()
{
    $db = conectarBD();
    $datos = getJsonData();

    if (empty($datos['nombre_completo']) || empty($datos['email']) || empty($datos['password'])) {
        mysqli_close($db); outputError(400, "Nombre, email y password son obligatorios.");
    }

    $nombre = mysqli_real_escape_string($db, trim($datos['nombre_completo']));
    $email = mysqli_real_escape_string($db, trim($datos['email']));
    $passwordHash = password_hash(trim($datos['password']), PASSWORD_DEFAULT);
    
    $fotoPerfil = !empty($datos['foto_perfil']) ? "'" . mysqli_real_escape_string($db, trim($datos['foto_perfil'])) . "'" : "'uploads/avatares/default-avatar.png'";

    $checkEmail = mysqli_query($db, "SELECT id FROM usuarios WHERE email = '$email'");
    if (mysqli_num_rows($checkEmail) > 0) {
        mysqli_close($db); outputError(409, "El email ya está registrado.");
    }

    $sql = "INSERT INTO usuarios (nombre_completo, email, password, foto_perfil) VALUES ('$nombre', '$email', '$passwordHash', $fotoPerfil)";
    mysqli_query($db, $sql);
    $usuarioId = mysqli_insert_id($db);
    mysqli_close($db);
    outputJson(["id" => $usuarioId, "mensaje" => "Usuario registrado con éxito"], 201);
}

function patchUsuarios($id)
{
    $usuarioActivo = verificarRol(['admin', 'cliente']);

    $db = conectarBD();
    if (empty($id) || $id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400, "ID inválido."); }
    
    validarPertenencia($db, 'usuarios', 'id', $id, $usuarioActivo);

    $idSafe = mysqli_real_escape_string($db, $id);
    $datos = getJsonData();

    $updates = [];
    if (!empty($datos['nombre_completo'])) $updates[] = "nombre_completo='" . mysqli_real_escape_string($db, trim($datos['nombre_completo'])) . "'";
    if (!empty($datos['password'])) $updates[] = "password='" . password_hash(trim($datos['password']), PASSWORD_DEFAULT) . "'";
    if (!empty($datos['foto_perfil'])) $updates[] = "foto_perfil='" . mysqli_real_escape_string($db, trim($datos['foto_perfil'])) . "'";

    if (!empty($updates)) {
        mysqli_query($db, "UPDATE usuarios SET " . implode(', ', $updates) . " WHERE id=$idSafe");
    }
    mysqli_close($db);
    outputJson(['id' => (int)$id, 'mensaje' => 'Usuario actualizado'], 200);
}

function deleteUsuarios($id)
{
    $usuarioActivo = verificarRol(['admin', 'cliente']);

    $db = conectarBD();
    if (empty($id) || $id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }
    
    validarPertenencia($db, 'usuarios', 'id', $id, $usuarioActivo);

    $idSafe = mysqli_real_escape_string($db, $id);
    mysqli_query($db, "DELETE FROM usuarios WHERE id=$idSafe");
    mysqli_close($db);
    outputJson(["mensaje" => "Usuario eliminado"], 200);
}

// ==========================================
// ENDPOINTS: LOOKBOOKS
// ==========================================
//
// Un lookbook es un álbum de fotos armado por el usuario. Se guarda como:
//   - composicion: JSON con [{ruta, w, h}] en el orden del álbum.
//       w = ancho en cuartos (1 = 25%, 2 = 50%, 3 = 75%, 4 = 100%)
//       h = alto en filas
//     No se guardan posiciones: el frontend calcula la grilla según la pantalla
//     (4 columnas en compu, 3 en tablet, 2 en celular).
//   - publico:     si aparece en la galería pública (/lookbooks)
//   - notas_medidas: privadas, solo las ven el dueño, a quienes se compartió y el admin
//
// Visibilidad:
//   - Público  -> cualquiera lo ve (sin las notas de medidas)
//   - Privado  -> solo el dueño, los usuarios con quienes lo compartió y el admin

// Lee el JWT si viene, pero sin exigirlo: los endpoints públicos lo usan
// para mostrar más datos cuando hay sesión, sin cortar a los anónimos.
function usuarioOpcional()
{
    $headers = apache_request_headers();
    $authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : (isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '');

    if (!$authHeader || !preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) return null;

    try {
        return (array) JWT::decode($matches[1], new Key(JWT_SECRET, 'HS256'));
    } catch (Exception $e) {
        return null; // Token vencido o inválido: se lo trata como visitante
    }
}

// Qué relación tiene el usuario con el lookbook: 'duenio', 'admin', 'compartido', 'publico' o 'ninguno'
function sf__accesoLookbook($db, $fila, $usuario)
{
    if ($usuario) {
        if ((int)$fila['usuario_creador_id'] === (int)$usuario['id']) return 'duenio';
        if ($usuario['rol'] === 'admin') return 'admin';

        $uid = (int)$usuario['id'];
        $lid = (int)$fila['id'];
        $check = mysqli_query($db, "SELECT id FROM lookbooks_compartidos WHERE lookbook_id = $lid AND usuario_receptor_id = $uid LIMIT 1");
        $esReceptor = mysqli_num_rows($check) > 0;
        mysqli_free_result($check);
        if ($esReceptor) return 'compartido';
    }
    return ((int)$fila['publico'] === 1) ? 'publico' : 'ninguno';
}

function sf__formatearLookbook($fila, $incluirNotas)
{
    settype($fila['id'], 'int');
    settype($fila['usuario_creador_id'], 'int');
    $fila['publico'] = (int)$fila['publico'] === 1;
    $fila['composicion'] = !empty($fila['composicion']) ? json_decode($fila['composicion'], true) : [];
    if (isset($fila['compartido_id'])) settype($fila['compartido_id'], 'int');

    // Las medidas son datos personales: en la vista pública no viajan
    if (!$incluirNotas) unset($fila['notas_medidas']);
    return $fila;
}

// Valida el álbum que manda el frontend. Devuelve la composición limpia
// (solo los campos esperados) o un string con el error.
function sf__validarComposicion($composicion)
{
    if (!is_array($composicion)) return "La composición debe ser una lista de fotos.";
    if (count($composicion) === 0) return "El lookbook necesita al menos una foto.";
    if (count($composicion) > LOOKBOOK_MAX_FOTOS) return "Un lookbook admite hasta " . LOOKBOOK_MAX_FOTOS . " fotos.";

    $limpia = [];
    foreach (array_values($composicion) as $i => $item) {
        $n = $i + 1;
        if (!is_array($item)) return "La foto $n tiene un formato inválido.";

        // Solo se aceptan imágenes subidas por /upload o fotos del catálogo.
        // Así nadie puede guardar una URL externa ni rutas con '..'.
        $ruta = isset($item['ruta']) ? trim((string)$item['ruta']) : '';
        $esSubida   = preg_match('#^uploads/img_[a-f0-9]+\.(jpg|png|webp)$#', $ruta) === 1;
        $esProducto = preg_match('#^assets/images/productos/[a-z0-9_\-/]+\.(jpg|jpeg|png|webp)$#i', $ruta) === 1
                      && strpos($ruta, '..') === false;
        if (!$esSubida && !$esProducto) return "La foto $n tiene una ruta no permitida.";

        $w = isset($item['w']) ? filter_var($item['w'], FILTER_VALIDATE_INT) : false;
        $h = isset($item['h']) ? filter_var($item['h'], FILTER_VALIDATE_INT) : false;
        if ($w === false || $w < 1 || $w > LOOKBOOK_ANCHO_MAX) return "La foto $n tiene un ancho inválido (de 1 a " . LOOKBOOK_ANCHO_MAX . " cuartos).";
        if ($h === false || $h < 1 || $h > LOOKBOOK_ALTO_MAX) return "La foto $n tiene un alto inválido (de 1 a " . LOOKBOOK_ALTO_MAX . " filas).";

        $limpia[] = ['ruta' => $ruta, 'w' => $w, 'h' => $h];
    }
    return $limpia;
}

function sf__jsonComposicion($composicion)
{
    return json_encode($composicion, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

// Borra del disco las fotos subidas que ya no usa nadie (ningún lookbook,
// reseña ni foto de perfil). Se llama al quitar fotos o borrar un lookbook,
// para que la carpeta uploads no se llene de archivos huérfanos.
function sf__borrarSubidasHuerfanas($db, $rutas)
{
    foreach (array_unique($rutas) as $ruta) {
        if (!preg_match('#^uploads/(img_[a-f0-9]+\.(jpg|png|webp))$#', $ruta, $m)) continue;

        $archivo = $m[1];
        $like = mysqli_real_escape_string($db, addcslashes($archivo, '%_'));

        $sql = "SELECT
                  (SELECT COUNT(*) FROM lookbooks WHERE composicion LIKE '%$like%')
                + (SELECT COUNT(*) FROM productos_resenas WHERE imagen_opcional LIKE '%$like%')
                + (SELECT COUNT(*) FROM usuarios WHERE foto_perfil LIKE '%$like%') AS usos";
        $res = mysqli_query($db, $sql);
        $usos = (int) mysqli_fetch_assoc($res)['usos'];
        mysqli_free_result($res);

        $rutaFisica = __DIR__ . '/../uploads/' . $archivo;
        if ($usos === 0 && is_file($rutaFisica)) {
            @unlink($rutaFisica);
        }
    }
}

// GET /lookbooks                  -> galería pública
// GET /lookbooks?vista=mios       -> los míos (requiere login)
// GET /lookbooks?vista=compartidos-> los que me compartieron (requiere login)
// GET /lookbooks?vista=todos      -> todos (solo admin, para moderar)
// GET /lookbooks/{id}             -> uno puntual, según permisos
function getLookbooks($id = null)
{
    $usuario = usuarioOpcional();
    $db = conectarBD();

    $select = "SELECT l.*, u.nombre_completo AS autor_nombre, u.foto_perfil AS autor_foto
               FROM lookbooks l INNER JOIN usuarios u ON u.id = l.usuario_creador_id";

    if ($id !== null) {
        if (!is_numeric($id) || $id <= 0) { mysqli_close($db); outputError(400, "ID inválido."); }
        $idSafe = (int)$id;

        $result = mysqli_query($db, "$select WHERE l.id = $idSafe");
        $fila = mysqli_fetch_assoc($result);
        mysqli_free_result($result);

        if (!$fila) { mysqli_close($db); outputError(404, "El lookbook no existe."); }

        $acceso = sf__accesoLookbook($db, $fila, $usuario);
        mysqli_close($db);

        // Un lookbook privado ajeno responde 404, no 403: así no se confirma
        // ni siquiera que existe.
        if ($acceso === 'ninguno') outputError(404, "El lookbook no existe.");

        $lookbook = sf__formatearLookbook($fila, $acceso !== 'publico');
        $lookbook['acceso'] = $acceso;
        outputJson($lookbook);
    }

    $vista = isset($_GET['vista']) ? $_GET['vista'] : 'publicos';
    $incluirNotas = true;

    switch ($vista) {
        case 'mios':
            if (!$usuario) { mysqli_close($db); outputError(401, "Iniciá sesión para ver tus lookbooks."); }
            $sql = "$select WHERE l.usuario_creador_id = " . (int)$usuario['id'];
            break;

        case 'compartidos':
            if (!$usuario) { mysqli_close($db); outputError(401, "Iniciá sesión para ver lo que te compartieron."); }
            $sql = "SELECT l.*, u.nombre_completo AS autor_nombre, u.foto_perfil AS autor_foto, lc.id AS compartido_id
                    FROM lookbooks l
                    INNER JOIN usuarios u ON u.id = l.usuario_creador_id
                    INNER JOIN lookbooks_compartidos lc ON lc.lookbook_id = l.id
                    WHERE lc.usuario_receptor_id = " . (int)$usuario['id'];
            break;

        case 'todos':
            if (!$usuario || $usuario['rol'] !== 'admin') { mysqli_close($db); outputError(403, "Solo un administrador puede ver todos los lookbooks."); }
            $sql = $select;
            break;

        default:
            $sql = "$select WHERE l.publico = 1";
            $incluirNotas = false;
    }

    $result = mysqli_query($db, "$sql ORDER BY l.fecha_actualizacion DESC");
    $ret = [];
    while ($fila = mysqli_fetch_assoc($result)) {
        $ret[] = sf__formatearLookbook($fila, $incluirNotas);
    }
    mysqli_free_result($result);
    mysqli_close($db);
    outputJson($ret);
}

function postLookbooks()
{
    $usuarioActivo = verificarRol(['cliente', 'admin']);
    $db = conectarBD();
    $datos = getJsonData();

    $titulo = isset($datos['titulo']) ? trim($datos['titulo']) : '';
    if ($titulo === '' || mb_strlen($titulo) > 100) {
        mysqli_close($db); outputError(400, "El título es obligatorio (máximo 100 caracteres).");
    }

    $composicion = sf__validarComposicion(isset($datos['composicion']) ? $datos['composicion'] : null);
    if (is_string($composicion)) { mysqli_close($db); outputError(400, $composicion); }

    $usuarioId = (int)$usuarioActivo['id'];
    $tituloSafe = mysqli_real_escape_string($db, $titulo);
    $portada = mysqli_real_escape_string($db, $composicion[0]['ruta']);
    $composicionSafe = mysqli_real_escape_string($db, sf__jsonComposicion($composicion));
    $notas = !empty($datos['notas_medidas']) ? "'" . mysqli_real_escape_string($db, trim($datos['notas_medidas'])) . "'" : "NULL";
    $publico = !empty($datos['publico']) ? 1 : 0;

    mysqli_query($db, "INSERT INTO lookbooks (usuario_creador_id, titulo, imagen_inspiracion, composicion, notas_medidas, publico)
                       VALUES ($usuarioId, '$tituloSafe', '$portada', '$composicionSafe', $notas, $publico)");
    $lookbookId = mysqli_insert_id($db);
    mysqli_close($db);

    outputJson(["id" => $lookbookId, "mensaje" => "Lookbook creado con éxito"], 201);
}

function patchLookbooks($id)
{
    $usuarioActivo = verificarRol(['cliente', 'admin']);
    $db = conectarBD();
    if (empty($id) || $id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }

    validarPertenencia($db, 'lookbooks', 'usuario_creador_id', $id, $usuarioActivo);

    $idSafe = (int)$id;
    $actual = mysqli_fetch_assoc(mysqli_query($db, "SELECT composicion FROM lookbooks WHERE id = $idSafe"));
    $composicionAnterior = !empty($actual['composicion']) ? json_decode($actual['composicion'], true) : [];

    $datos = getJsonData() ?? [];
    $updates = [];

    if (isset($datos['titulo'])) {
        $titulo = trim($datos['titulo']);
        if ($titulo === '' || mb_strlen($titulo) > 100) {
            mysqli_close($db); outputError(400, "El título es obligatorio (máximo 100 caracteres).");
        }
        $updates[] = "titulo='" . mysqli_real_escape_string($db, $titulo) . "'";
    }

    $composicionNueva = null;
    if (isset($datos['composicion'])) {
        $composicionNueva = sf__validarComposicion($datos['composicion']);
        if (is_string($composicionNueva)) { mysqli_close($db); outputError(400, $composicionNueva); }

        $updates[] = "composicion='" . mysqli_real_escape_string($db, sf__jsonComposicion($composicionNueva)) . "'";
        // La portada es la primera foto del álbum
        $updates[] = "imagen_inspiracion='" . mysqli_real_escape_string($db, $composicionNueva[0]['ruta']) . "'";
    }

    if (array_key_exists('notas_medidas', $datos)) {
        $notas = trim((string)$datos['notas_medidas']);
        $updates[] = $notas === '' ? "notas_medidas=NULL" : "notas_medidas='" . mysqli_real_escape_string($db, $notas) . "'";
    }
    if (isset($datos['publico'])) $updates[] = "publico=" . ($datos['publico'] ? 1 : 0);

    if (!empty($updates)) {
        mysqli_query($db, "UPDATE lookbooks SET " . implode(', ', $updates) . " WHERE id=$idSafe");
    }

    // Las fotos que se sacaron del álbum se borran del disco (si nadie más las usa)
    if ($composicionNueva !== null) {
        $rutasNuevas = array_column($composicionNueva, 'ruta');
        $quitadas = array_diff(array_column($composicionAnterior, 'ruta'), $rutasNuevas);
        sf__borrarSubidasHuerfanas($db, $quitadas);
    }

    mysqli_close($db);
    outputJson(['id' => (int)$id, 'mensaje' => 'Lookbook actualizado'], 200);
}

function deleteLookbooks($id)
{
    $usuarioActivo = verificarRol(['cliente', 'admin']);
    $db = conectarBD();
    if (empty($id) || $id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }

    validarPertenencia($db, 'lookbooks', 'usuario_creador_id', $id, $usuarioActivo);

    $idSafe = (int)$id;
    $fila = mysqli_fetch_assoc(mysqli_query($db, "SELECT composicion FROM lookbooks WHERE id = $idSafe"));
    $rutas = !empty($fila['composicion']) ? array_column(json_decode($fila['composicion'], true), 'ruta') : [];

    // Los registros de lookbooks_compartidos se borran solos (ON DELETE CASCADE)
    mysqli_query($db, "DELETE FROM lookbooks WHERE id=$idSafe");
    sf__borrarSubidasHuerfanas($db, $rutas);

    mysqli_close($db);
    outputJson(["mensaje" => "Lookbook eliminado"], 200);
}

// ==========================================
// ENDPOINTS: COMPARTIR LOOKBOOKS
// ==========================================

// GET /directorio?q=texto -> busca usuarios registrados para compartirles un lookbook.
// Busca por nombre (parcial) o por email (exacto). Nunca devuelve emails: solo
// lo mínimo para reconocer a la persona, así no sirve para juntar direcciones.
function getDirectorio()
{
    $usuarioActivo = verificarRol(['cliente', 'admin']);

    $q = isset($_GET['q']) ? trim($_GET['q']) : '';
    if (mb_strlen($q) < 2) outputJson([]);

    $db = conectarBD();
    $uid = (int)$usuarioActivo['id'];
    $qSafe = mysqli_real_escape_string($db, $q);

    if (filter_var($q, FILTER_VALIDATE_EMAIL)) {
        $where = "email = '$qSafe'";
    } else {
        $like = addcslashes($qSafe, '%_');
        $where = "nombre_completo LIKE '%$like%'";
    }

    $result = mysqli_query($db, "SELECT id, nombre_completo, foto_perfil FROM usuarios WHERE $where AND id != $uid ORDER BY nombre_completo LIMIT 8");
    $ret = [];
    while ($fila = mysqli_fetch_assoc($result)) {
        settype($fila['id'], 'int');
        $ret[] = $fila;
    }
    mysqli_free_result($result);
    mysqli_close($db);
    outputJson($ret);
}

// GET /compartidos?lookbook_id=1 -> con quién compartí este lookbook (solo el dueño o admin)
function getCompartidos()
{
    $usuarioActivo = verificarRol(['cliente', 'admin']);
    $db = conectarBD();

    $lookbookId = isset($_GET['lookbook_id']) ? (int)$_GET['lookbook_id'] : 0;
    if ($lookbookId <= 0) { mysqli_close($db); outputError(400, "Indicá el lookbook_id."); }

    validarPertenencia($db, 'lookbooks', 'usuario_creador_id', $lookbookId, $usuarioActivo);

    $result = mysqli_query($db, "SELECT lc.id, lc.usuario_receptor_id, u.nombre_completo, u.foto_perfil, lc.fecha_compartido
                                 FROM lookbooks_compartidos lc
                                 INNER JOIN usuarios u ON u.id = lc.usuario_receptor_id
                                 WHERE lc.lookbook_id = $lookbookId
                                 ORDER BY lc.fecha_compartido DESC");
    $ret = [];
    while ($fila = mysqli_fetch_assoc($result)) {
        settype($fila['id'], 'int');
        settype($fila['usuario_receptor_id'], 'int');
        $ret[] = $fila;
    }
    mysqli_free_result($result);
    mysqli_close($db);
    outputJson($ret);
}

// POST /compartidos {lookbook_id, usuario_receptor_id}
function postCompartidos()
{
    $usuarioActivo = verificarRol(['cliente', 'admin']);
    $db = conectarBD();
    $datos = getJsonData();

    $lookbookId = isset($datos['lookbook_id']) ? (int)$datos['lookbook_id'] : 0;
    $receptorId = isset($datos['usuario_receptor_id']) ? (int)$datos['usuario_receptor_id'] : 0;
    if ($lookbookId <= 0 || $receptorId <= 0) {
        mysqli_close($db); outputError(400, "lookbook_id y usuario_receptor_id son obligatorios.");
    }

    validarPertenencia($db, 'lookbooks', 'usuario_creador_id', $lookbookId, $usuarioActivo);

    $autor = mysqli_fetch_assoc(mysqli_query($db, "SELECT usuario_creador_id FROM lookbooks WHERE id = $lookbookId"));
    if ((int)$autor['usuario_creador_id'] === $receptorId) {
        mysqli_close($db); outputError(400, "No podés compartir un lookbook con su propio autor.");
    }

    $check = mysqli_query($db, "SELECT id FROM usuarios WHERE id = $receptorId");
    $existe = mysqli_num_rows($check) > 0;
    mysqli_free_result($check);
    if (!$existe) { mysqli_close($db); outputError(404, "El usuario no existe."); }

    $emisorId = (int)$usuarioActivo['id'];

    // UNIQUE(lookbook_id, usuario_receptor_id) evita compartir dos veces con la misma persona
    try {
        mysqli_query($db, "INSERT INTO lookbooks_compartidos (lookbook_id, usuario_emisor_id, usuario_receptor_id) VALUES ($lookbookId, $emisorId, $receptorId)");
    } catch (mysqli_sql_exception $e) {
        mysqli_close($db);
        if ($e->getCode() === 1062) outputError(409, "Ya compartiste este lookbook con esa persona.");
        outputError(500, "No se pudo compartir el lookbook.");
    }

    $compartidoId = mysqli_insert_id($db);
    mysqli_close($db);
    outputJson(["id" => $compartidoId, "mensaje" => "Lookbook compartido"], 201);
}

// DELETE /compartidos/{id} -> el dueño deja de compartir, o el receptor lo quita de su lista
function deleteCompartidos($id)
{
    $usuarioActivo = verificarRol(['cliente', 'admin']);
    $db = conectarBD();
    if (empty($id) || $id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }

    $idSafe = (int)$id;
    $result = mysqli_query($db, "SELECT lc.usuario_receptor_id, l.usuario_creador_id
                                 FROM lookbooks_compartidos lc
                                 INNER JOIN lookbooks l ON l.id = lc.lookbook_id
                                 WHERE lc.id = $idSafe");
    $fila = mysqli_fetch_assoc($result);
    mysqli_free_result($result);

    if (!$fila) { mysqli_close($db); outputError(404, "Registro no encontrado."); }

    $uid = (int)$usuarioActivo['id'];
    $puede = $usuarioActivo['rol'] === 'admin'
          || (int)$fila['usuario_creador_id'] === $uid
          || (int)$fila['usuario_receptor_id'] === $uid;
    if (!$puede) { mysqli_close($db); outputError(403, "Acceso denegado."); }

    mysqli_query($db, "DELETE FROM lookbooks_compartidos WHERE id = $idSafe");
    mysqli_close($db);
    outputJson(["mensaje" => "Se dejó de compartir el lookbook"], 200);
}

// ==========================================
// ENDPOINTS: PEDIDOS
// ==========================================

function restaurarStock($db, $detalles)
{
    $idsStock = array_map('intval', explode('####', $detalles));
    foreach ($idsStock as $stockId) {
        if ($stockId > 0) {
            mysqli_query($db, "UPDATE productos_stock SET stock = stock + 1 WHERE id = $stockId");
        }
    }
}

function getPedidos($id = null)
{
    $usuarioActivo = verificarRol(['cliente', 'admin']);
    $db = conectarBD();
    
    $whereSql = ($usuarioActivo['rol'] === 'cliente') ? "WHERE usuario_id = " . (int)$usuarioActivo['id'] : "WHERE 1=1";
    
    if (!empty($id)) {
        if ($id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }
        $idSafe = mysqli_real_escape_string($db, $id);
        $whereSql .= " AND id = $idSafe";
    }

    $sql = "SELECT * FROM pedidos $whereSql";
    $result = mysqli_query($db, $sql);
    
    $ret = [];
    while ($fila = mysqli_fetch_assoc($result)) {
        settype($fila['id'], 'int');
        settype($fila['usuario_id'], 'int');
        settype($fila['total'], 'float');
        
        // Convertimos los ids de stock ("2####9") en nombre + talle legibles para el frontend
        $idsStock = explode('####', $fila['detalles']);
        $itemsLegibles = [];
        
        foreach ($idsStock as $item) {
            $stockIdSafe = (int) trim($item);
            if ($stockIdSafe > 0) {
                $infoQuery = mysqli_query($db, "SELECT p.nombre, ps.talle FROM productos_stock ps INNER JOIN productos p ON p.id = ps.producto_id WHERE ps.id = $stockIdSafe");
                if ($infoRow = mysqli_fetch_assoc($infoQuery)) {
                    $itemsLegibles[] = $infoRow['nombre'] . ' (' . $infoRow['talle'] . ')';
                }
                mysqli_free_result($infoQuery);
            }
        }
        
        $fila['detalles'] = implode(' + ', $itemsLegibles);
        $ret[] = $fila;
    }
    mysqli_free_result($result);
    mysqli_close($db);
    
    if ($id !== null) {
        if (empty($ret)) outputError(404, "Pedido no encontrado o no te pertenece.");
        outputJson($ret[0]);
    } else outputJson($ret);
}

function postPedidos()
{
    $usuarioActivo = verificarRol(['cliente', 'admin']);
    $db = conectarBD();
    $datos = getJsonData();

    if (empty($datos['detalles'])) {
        mysqli_close($db); outputError(400, "Los detalles (IDs de stock) son obligatorios.");
    }

    $usuarioId = (int)$usuarioActivo['id'];
    $tipoPedido = isset($datos['tipo_pedido']) ? mysqli_real_escape_string($db, trim($datos['tipo_pedido'])) : 'venta_estandar';

    // El string de entrada es "idStock####idStock####...". Cada idStock es el id de una
    // fila de productos_stock: todo producto tiene al menos una (incluso sin talles, con
    // talle='Único'), así que ese único número ya identifica producto + variante.
    $detallesCrudos = trim($datos['detalles']);
    $idsStock = array_map('intval', explode('####', $detallesCrudos));

    $totalCalculado = 0.00;
    $stockIdsValidos = [];

    foreach ($idsStock as $stockId) {
        if ($stockId <= 0) continue;

        $query = mysqli_query($db, "SELECT ps.stock, p.precio FROM productos_stock ps INNER JOIN productos p ON p.id = ps.producto_id WHERE ps.id = $stockId");
        $fila = mysqli_fetch_assoc($query);
        mysqli_free_result($query);

        if (!$fila) {
            mysqli_close($db); outputError(404, "El ítem de stock ID $stockId no existe.");
        }

        if ((int)$fila['stock'] < 1) {
            mysqli_close($db); outputError(409, "Sin stock disponible para el ítem ID $stockId.");
        }

        $totalCalculado += (float) $fila['precio'];
        $stockIdsValidos[] = $stockId;
    }

    if (empty($stockIdsValidos)) {
        mysqli_close($db); outputError(400, "Formato de detalles inválido. Usa idStock####idStock####...");
    }

    $detallesSeguros = implode('####', $stockIdsValidos);

    foreach ($stockIdsValidos as $stockId) {
        mysqli_query($db, "UPDATE productos_stock SET stock = stock - 1 WHERE id = $stockId");
    }

    if ($tipoPedido === 'sastreria_medida') {
        $totalCalculado += RECARGO_SASTRERIA;
    }

    mysqli_query($db, "INSERT INTO pedidos (usuario_id, tipo_pedido, detalles, total, estado) VALUES ($usuarioId, '$tipoPedido', '$detallesSeguros', $totalCalculado, 'pendiente')");
    $pedidoId = mysqli_insert_id($db);
    mysqli_close($db);
    
    outputJson([
        "id" => $pedidoId, 
        "mensaje" => "Pedido registrado con exito",
        "total_cobrado" => $totalCalculado
    ], 201);
}

function patchPedidos($id)
{
    $usuarioActivo = verificarRol(['admin', 'cliente']);
    $db = conectarBD();
    
    if (empty($id) || $id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }
    validarPertenencia($db, 'pedidos', 'usuario_id', $id, $usuarioActivo);

    $idSafe = mysqli_real_escape_string($db, $id);
    $pedidoFila = mysqli_fetch_assoc(mysqli_query($db, "SELECT estado, detalles FROM pedidos WHERE id=$idSafe"));
    $estadoActual = $pedidoFila['estado'];
    
    $datos = getJsonData();
    $updates = [];

    // NOTA ARQUITECTÓNICA: Se bloquea la edición de 'detalles' y 'total' para TODOS los roles. 
    // Un pedido es inmutable financieramente. Si el contenido está mal, se cancela y se
    // vuelve a hacer (si el estado lo permite), o lo resuelve un admin.

    if ($usuarioActivo['rol'] === 'cliente') {
        if (isset($datos['estado'])) {
            if ($datos['estado'] !== 'cancelado') { 
                mysqli_close($db); outputError(403, "Como cliente solo puedes cambiar el estado a 'cancelado'."); 
            }
            if ($estadoActual !== 'pendiente' && $estadoActual !== 'pagado') {
                mysqli_close($db); outputError(403, "No puedes cancelar un pedido que ya está en proceso o ha sido enviado. Comunícate con un administrador.");
            }
            $updates[] = "estado='cancelado'";
        }
    } else { // Admin
        if (isset($datos['estado'])) $updates[] = "estado='" . mysqli_real_escape_string($db, trim($datos['estado'])) . "'";
        if (isset($datos['tipo_pedido'])) $updates[] = "tipo_pedido='" . mysqli_real_escape_string($db, trim($datos['tipo_pedido'])) . "'";
    }

    $estadosQueDevuelvenStock = ['cancelado', 'reembolsado'];
    $nuevoEstado = isset($datos['estado']) ? trim($datos['estado']) : $estadoActual;

    if (in_array($nuevoEstado, $estadosQueDevuelvenStock) && !in_array($estadoActual, $estadosQueDevuelvenStock)) {
        restaurarStock($db, $pedidoFila['detalles']);
    }

    if (!empty($updates)) {
        mysqli_query($db, "UPDATE pedidos SET " . implode(', ', $updates) . " WHERE id=$idSafe");
    }
    
    mysqli_close($db);
    outputJson(['id' => (int)$id], 200);
}

function deletePedidos($id)
{
    verificarRol(['admin']);

    $db = conectarBD();
    if (empty($id) || $id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }

    $idSafe = mysqli_real_escape_string($db, $id);
    $result = mysqli_query($db, "SELECT estado, detalles FROM pedidos WHERE id=$idSafe");
    $pedidoFila = mysqli_fetch_assoc($result);

    if (!$pedidoFila) {
        mysqli_close($db);
        outputError(404, "Pedido no encontrado.");
    }

    $estadoActual = $pedidoFila['estado'];

    if ($estadoActual !== 'pendiente' && $estadoActual !== 'cancelado') {
        mysqli_close($db);
        outputError(403, "Este pedido ya tiene movimiento (pagado, en proceso, enviado, etc.) y no puede eliminarse. Cambie su estado mediante PATCH si necesita anularlo.");
    }

    if ($estadoActual === 'pendiente') {
        restaurarStock($db, $pedidoFila['detalles']);
    }

    mysqli_query($db, "DELETE FROM pedidos WHERE id=$idSafe");
    mysqli_close($db);
    outputJson(["mensaje" => "Pedido eliminado"], 200);
}

// ==========================================
// ENDPOINTS: RESEÑAS
// ==========================================

function getResenas($id = null)
{
    // Público (Cualquiera puede leer reseñas)
    $db = conectarBD();
    $whereSql = '';
    
    if (!empty($id)) {
        $idSafe = mysqli_real_escape_string($db, $id);
        $whereSql = "WHERE id = $idSafe";
    }
    
    // Permitir filtrar reseñas por producto desde la URL (?accion=resenas&producto_id=1)
    if (isset($_GET['producto_id'])) {
        $prodIdSafe = mysqli_real_escape_string($db, $_GET['producto_id']);
        $whereSql = $whereSql ? $whereSql . " AND producto_id = $prodIdSafe" : "WHERE producto_id = $prodIdSafe";
    }

    $sql = "SELECT * FROM productos_resenas $whereSql";
    $result = mysqli_query($db, $sql);
    $ret = [];
    while ($fila = mysqli_fetch_assoc($result)) {
        settype($fila['id'], 'int');
        settype($fila['producto_id'], 'int');
        settype($fila['usuario_id'], 'int');
        settype($fila['calificacion'], 'int');
        settype($fila['compra_verificada'], 'bool');
        $ret[] = $fila;
    }
    mysqli_free_result($result);
    mysqli_close($db);
    
    if ($id !== null && empty($_GET['producto_id'])) {
        if (empty($ret)) outputError(404, "Reseña no encontrada.");
        outputJson($ret[0]);
    } else outputJson($ret);
}

function postResenas()
{
    $usuarioActivo = verificarRol(['cliente', 'admin']);

    $db = conectarBD();
    $datos = getJsonData();

    if (empty($datos['producto_id']) || empty($datos['calificacion'])) {
        mysqli_close($db); outputError(400, "Producto y calificación son obligatorios.");
    }

    $productoId = (int)$datos['producto_id'];
    $usuarioId = (int)$usuarioActivo['id'];
    $calificacion = (int)$datos['calificacion'];
    
    if ($calificacion < 1 || $calificacion > 5) {
        mysqli_close($db); outputError(400, "La calificación debe estar entre 1 y 5.");
    }

    $comentario = !empty($datos['comentario']) ? "'" . mysqli_real_escape_string($db, trim($datos['comentario'])) . "'" : "NULL";
    $imagen = !empty($datos['imagen_opcional']) ? "'" . mysqli_real_escape_string($db, trim($datos['imagen_opcional'])) . "'" : "NULL";
    
    // --- LÓGICA DE VERIFICACIÓN AUTOMÁTICA DE COMPRA (Actualizada) ---
    // Buscamos si el usuario tiene un pedido avanzado donde el detalle incluya el ID del producto
    // Usamos LIKE '%ID%' pero con cuidado (ej: '%1%' matchearía '10'). 
    // Como usamos ####, buscamos el ID exacto con comodines de mysql
    
    // Construimos la expresión regular para asegurar match exacto del ID en la lista delimitada
    $verificacionSql = "SELECT p.id FROM pedidos p
                        INNER JOIN productos_stock ps ON FIND_IN_SET(ps.id, REPLACE(p.detalles, '####', ',')) > 0
                        WHERE p.usuario_id = $usuarioId
                        AND p.estado IN ('pagado', 'en proceso', 'listo', 'enviado')
                        AND ps.producto_id = $productoId
                        LIMIT 1";
                        
    $verificacionResult = mysqli_query($db, $verificacionSql);
    $compraVerificada = (mysqli_num_rows($verificacionResult) > 0) ? "TRUE" : "FALSE";
    mysqli_free_result($verificacionResult);
    // ---------------------------------------------------

    $sql = "INSERT INTO productos_resenas (producto_id, usuario_id, calificacion, comentario, compra_verificada, imagen_opcional) 
            VALUES ($productoId, $usuarioId, $calificacion, $comentario, $compraVerificada, $imagen)";
    
    mysqli_query($db, $sql);
    $resenaId = mysqli_insert_id($db);
    mysqli_close($db);
    
    outputJson([
        "id" => $resenaId, 
        "mensaje" => "Reseña publicada con éxito", 
        "compra_verificada" => $compraVerificada === "TRUE"
    ], 201);
}

function patchResenas($id)
{
    $usuarioActivo = verificarRol(['cliente', 'admin']);

    $db = conectarBD();
    if (empty($id) || $id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }
    
    validarPertenencia($db, 'productos_resenas', 'usuario_id', $id, $usuarioActivo);

    $idSafe = mysqli_real_escape_string($db, $id);
    $datos = getJsonData();
    $updates = [];

    if (isset($datos['calificacion'])) {
        $cal = (int)$datos['calificacion'];
        if ($cal >= 1 && $cal <= 5) $updates[] = "calificacion=$cal";
    }
    if (isset($datos['comentario'])) $updates[] = "comentario='" . mysqli_real_escape_string($db, trim($datos['comentario'])) . "'";
    if (isset($datos['imagen_opcional'])) $updates[] = "imagen_opcional='" . mysqli_real_escape_string($db, trim($datos['imagen_opcional'])) . "'";
    
    // NOTA DE SEGURIDAD: compra_verificada, fecha_creacion y fecha_actualizacion 
    // han sido bloqueadas deliberadamente de este endpoint para evitar manipulaciones.

    if (!empty($updates)) {
        mysqli_query($db, "UPDATE productos_resenas SET " . implode(', ', $updates) . " WHERE id=$idSafe");
    }
    mysqli_close($db);
    outputJson(['id' => (int)$id, 'mensaje' => 'Reseña actualizada'], 200);
}

function deleteResenas($id)
{
    $usuarioActivo = verificarRol(['cliente', 'admin']);

    $db = conectarBD();
    if (empty($id) || $id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }
    
    validarPertenencia($db, 'productos_resenas', 'usuario_id', $id, $usuarioActivo);

    $idSafe = mysqli_real_escape_string($db, $id);
    mysqli_query($db, "DELETE FROM productos_resenas WHERE id=$idSafe");
    mysqli_close($db);
    outputJson(["mensaje" => "Reseña eliminada"], 200);
}

// ==========================================
// ENDPOINTS: CITAS
// ==========================================

// Turnos de 1 hora, de 9 a 17 (el último empieza a las 17:00 y termina a las 18:00,
// cubriendo el horario de atención "de 9 a 6" que definiste).
function sf__horasDisponibles(): array
{
    return ['09:00:00','10:00:00','11:00:00','12:00:00','13:00:00','14:00:00','15:00:00','16:00:00','17:00:00'];
}

// Público: qué turnos están ocupados para una fecha, o qué días de un mes
// tienen turnos ocupados (para pintar el calendario sin pedir día por día).
// Devuelve SIEMPRE la hora real del servidor: el frontend debe usar ese valor,
// no el reloj local del usuario, para decidir qué turnos ya pasaron.
function getDisponibilidad()
{
    $db = conectarBD();

    if (isset($_GET['fecha'])) {
        $fecha = $_GET['fecha'];
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
            mysqli_close($db); outputError(400, "Formato de fecha inválido. Usa YYYY-MM-DD.");
        }
        $fechaSafe = mysqli_real_escape_string($db, $fecha);

        $result = mysqli_query($db, "SELECT hora FROM citas WHERE fecha = '$fechaSafe' AND estado != 'cancelada'");
        $ocupados = [];
        while ($fila = mysqli_fetch_assoc($result)) {
            $ocupados[] = substr($fila['hora'], 0, 5); // '09:00:00' -> '09:00'
        }
        mysqli_free_result($result);
        mysqli_close($db);

        outputJson([
            "fecha" => $fecha,
            "ocupados" => $ocupados,
            "servidor_fecha_hora" => date('Y-m-d H:i:s')
        ]);
    }

    if (isset($_GET['mes'])) {
        $mes = $_GET['mes'];
        if (!preg_match('/^\d{4}-\d{2}$/', $mes)) {
            mysqli_close($db); outputError(400, "Formato de mes inválido. Usa YYYY-MM.");
        }
        $mesSafe = mysqli_real_escape_string($db, $mes);
        $totalTurnos = count(sf__horasDisponibles());

        $result = mysqli_query($db, "SELECT fecha, COUNT(*) as ocupados FROM citas WHERE fecha LIKE '$mesSafe-%' AND estado != 'cancelada' GROUP BY fecha");
        $dias = [];
        while ($fila = mysqli_fetch_assoc($result)) {
            $dias[] = [
                "fecha" => $fila['fecha'],
                "ocupados" => (int) $fila['ocupados'],
                "lleno" => (int) $fila['ocupados'] >= $totalTurnos
            ];
        }
        mysqli_free_result($result);
        mysqli_close($db);

        outputJson([
            "mes" => $mes,
            "dias" => $dias,
            "servidor_fecha_hora" => date('Y-m-d H:i:s')
        ]);
    }

    mysqli_close($db);
    outputError(400, "Especificá 'fecha' (YYYY-MM-DD) o 'mes' (YYYY-MM) como parámetro.");
}

function getCitas($id = null)
{
    verificarRol(['admin']);
    $db = conectarBD();

    $whereSql = '';
    if (!empty($id)) {
        if ($id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }
        $idSafe = mysqli_real_escape_string($db, $id);
        $whereSql = "WHERE id = $idSafe";
    }

    $result = mysqli_query($db, "SELECT * FROM citas $whereSql ORDER BY fecha, hora");
    $ret = [];
    while ($fila = mysqli_fetch_assoc($result)) {
        settype($fila['id'], 'int');
        $fila['usuario_id'] = $fila['usuario_id'] !== null ? (int) $fila['usuario_id'] : null;
        $ret[] = $fila;
    }
    mysqli_free_result($result);
    mysqli_close($db);

    if ($id !== null) {
        if (empty($ret)) outputError(404, "Cita no encontrada.");
        outputJson($ret[0]);
    } else outputJson($ret);
}

function postCitas()
{
    $db = conectarBD();
    $datos = getJsonData();

        // Los tres datos de contacto son obligatorios: el turno nace como 'reservada'
    // y solo pasa a 'confirmada' cuando el local se comunica con la persona,
    // así que sin teléfono el flujo de confirmación no puede completarse.
    if (empty($datos['nombre_contacto']) || empty($datos['email_contacto']) || empty($datos['telefono_contacto'])) {
        mysqli_close($db); outputError(400, "Nombre, email y teléfono de contacto son obligatorios.");
    }
    if (!filter_var(trim($datos['email_contacto']), FILTER_VALIDATE_EMAIL)) {
        mysqli_close($db); outputError(400, "El email de contacto no es válido.");
    }
    if (strlen(preg_replace('/\D/', '', $datos['telefono_contacto'])) < 8) {
        mysqli_close($db); outputError(400, "El teléfono de contacto no es válido.");
    }
    if (empty($datos['fecha']) || empty($datos['hora'])) {
        mysqli_close($db); outputError(400, "Fecha y hora son obligatorias.");
    }

    $nombre = mysqli_real_escape_string($db, trim($datos['nombre_contacto']));
    $email = mysqli_real_escape_string($db, trim($datos['email_contacto']));
    $telefono = "'" . mysqli_real_escape_string($db, trim($datos['telefono_contacto'])) . "'";
    $tipo = (isset($datos['tipo']) && $datos['tipo'] === 'sastreria_medida') ? 'sastreria_medida' : 'visita';
    $aclaraciones = !empty($datos['aclaraciones']) ? "'" . mysqli_real_escape_string($db, trim($datos['aclaraciones'])) . "'" : "NULL";

    $fecha = trim($datos['fecha']);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        mysqli_close($db); outputError(400, "Formato de fecha inválido. Usa YYYY-MM-DD.");
    }

    // Solo se aceptan los horarios de atención exactos, en punto
    $hora = trim($datos['hora']);
    if (strlen($hora) === 5) $hora .= ':00'; // acepta "09:00" además de "09:00:00"
    if (!in_array($hora, sf__horasDisponibles())) {
        mysqli_close($db); outputError(400, "Horario fuera de atención. Elegí un turno entre las 09:00 y las 17:00.");
    }

    // LA VALIDACIÓN QUE IMPORTA DE VERDAD: se compara contra la hora real del
    // SERVIDOR (time()), nunca contra lo que mande el cliente. Así, aunque
    // alguien cambie el reloj de su PC o de su navegador, no puede reservar
    // un turno que ya pasó.
    $fechaHoraSolicitada = strtotime("$fecha $hora");
    if ($fechaHoraSolicitada === false || $fechaHoraSolicitada <= time()) {
        mysqli_close($db); outputError(400, "Ese turno ya pasó. Elegí un horario futuro.");
    }

    // Si viene un JWT válido, asociamos la reserva al usuario logueado.
    // Si no hay token o es inválido, seguimos como reserva anónima: no se
    // exige login para agendar una visita.
    $usuarioId = "NULL";
    $headers = apache_request_headers();
    $authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : (isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '');
    if ($authHeader && preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        try {
            $decoded = JWT::decode($matches[1], new Key(JWT_SECRET, 'HS256'));
            $usuarioId = (int) $decoded->id;
        } catch (Exception $e) {
            // Token inválido o expirado: no es un error, seguimos como anónimo.
        }
    }

    mysqli_query($db, "INSERT INTO citas (usuario_id, nombre_contacto, email_contacto, telefono_contacto, tipo, fecha, hora, aclaraciones) 
            VALUES ($usuarioId, '$nombre', '$email', $telefono, '$tipo', '$fecha', '$hora', $aclaraciones)");

    // La restricción UNIQUE(fecha, hora) es la que de verdad evita que dos
    // personas reserven el mismo turno en simultáneo (condición de carrera):
    // el frontend solo oculta visualmente los turnos ocupados a modo de
    // comodidad, pero la garantía real la da la base de datos, acá.
    if (mysqli_errno($db) === 1062) {
        mysqli_close($db);
        outputError(409, "Ese horario acaba de ser reservado por otra persona. Elegí otro turno.");
    }

    $citaId = mysqli_insert_id($db);
    mysqli_close($db);

    outputJson(["id" => $citaId, "mensaje" => "Cita reservada con éxito"], 201);
}

// Admin: bloquea uno o varios turnos de un día (por ejemplo, un feriado o un
// compromiso personal del dueño). Si no se especifican horas, bloquea el día
// completo. Reutiliza el mismo mecanismo que una reserva real: crea filas en
// 'citas' con estado='bloqueada', así que ocupan el turno exactamente igual
// que un cliente (getDisponibilidad ya las trata como ocupadas sin cambios).
function postBloqueos()
{
    verificarRol(['admin']);
    $db = conectarBD();
    $datos = getJsonData();

    if (empty($datos['fecha'])) {
        mysqli_close($db); outputError(400, "La fecha es obligatoria.");
    }
    $fecha = trim($datos['fecha']);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        mysqli_close($db); outputError(400, "Formato de fecha inválido. Usa YYYY-MM-DD.");
    }

    // Sin 'horas' especificas, se bloquea el día entero
    $horasDisponibles = sf__horasDisponibles();
    $horasPedidas = $horasDisponibles;

    if (!empty($datos['horas']) && is_array($datos['horas'])) {
        $horasPedidas = [];
        foreach ($datos['horas'] as $h) {
            $h = trim($h);
            if (strlen($h) === 5) $h .= ':00';
            if (in_array($h, $horasDisponibles)) $horasPedidas[] = $h;
        }
        if (empty($horasPedidas)) {
            mysqli_close($db); outputError(400, "Ninguna de las horas enviadas es un horario de atención válido.");
        }
    }

    $motivo = !empty($datos['motivo']) ? mysqli_real_escape_string($db, trim($datos['motivo'])) : 'Bloqueado por administración';
    $fechaSafe = mysqli_real_escape_string($db, $fecha);

    $bloqueados = [];
    $yaOcupados = [];

    foreach ($horasPedidas as $hora) {
        // El teléfono va con un guion: la columna es NOT NULL, pero un bloqueo
        // no es una persona a la que haya que llamar para confirmar.
        mysqli_query($db, "INSERT INTO citas (usuario_id, nombre_contacto, email_contacto, telefono_contacto, tipo, fecha, hora, aclaraciones, estado) 
            VALUES (NULL, 'Administración', 'admin@somosgentleman.com', '-', 'visita', '$fechaSafe', '$hora', '$motivo', 'bloqueada')");
        // Si ese turno ya tenía una reserva real (o ya estaba bloqueado), el UNIQUE
        // lo rechaza: lo salteamos sin frenar el resto de las horas pedidas.
        if (mysqli_errno($db) === 1062) {
            $yaOcupados[] = substr($hora, 0, 5);
            continue;
        }
        $bloqueados[] = substr($hora, 0, 5);
    }

    mysqli_close($db);
    outputJson([
        "mensaje" => "Bloqueo procesado",
        "fecha" => $fecha,
        "horas_bloqueadas" => $bloqueados,
        "horas_ya_ocupadas" => $yaOcupados
    ], 201);
}

function patchCitas($id)
{
    verificarRol(['admin']);
    $db = conectarBD();

    if (empty($id) || $id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }
    $idSafe = mysqli_real_escape_string($db, $id);

    $check = mysqli_query($db, "SELECT id FROM citas WHERE id = $idSafe");
    if (mysqli_num_rows($check) === 0) {
        mysqli_free_result($check);
        mysqli_close($db); outputError(404, "Cita no encontrada.");
    }
    mysqli_free_result($check);

    $datos = getJsonData();
    $estadosValidos = ['reservada', 'confirmada', 'finalizada', 'cancelada', 'ausente'];
    $updates = [];

    if (isset($datos['estado'])) {
        if (!in_array($datos['estado'], $estadosValidos)) {
            mysqli_close($db); outputError(400, "Estado inválido.");
        }
        $updates[] = "estado='" . mysqli_real_escape_string($db, $datos['estado']) . "'";
    }
    if (isset($datos['aclaraciones'])) {
        $updates[] = "aclaraciones='" . mysqli_real_escape_string($db, trim($datos['aclaraciones'])) . "'";
    }

    if (!empty($updates)) {
        mysqli_query($db, "UPDATE citas SET " . implode(', ', $updates) . " WHERE id=$idSafe");
    }
    mysqli_close($db);
    outputJson(['id' => (int)$id, 'mensaje' => 'Cita actualizada'], 200);
}

function deleteCitas($id)
{
    verificarRol(['admin']);
    $db = conectarBD();

    if (empty($id) || $id <= 0 || !is_numeric($id)) { mysqli_close($db); outputError(400); }
    $idSafe = mysqli_real_escape_string($db, $id);

    mysqli_query($db, "DELETE FROM citas WHERE id=$idSafe");
    mysqli_close($db);
    outputJson(["mensaje" => "Cita eliminada"], 200);
}
?>