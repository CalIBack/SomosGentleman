-- ==========================================================
-- DUMP DE BASE DE DATOS: SOMOS GENTLEMAN (Estructura Dinámica)
-- ==========================================================
USE `gentleman_db`;

-- Deshabilitar la restricción de claves foráneas temporalmente
SET FOREIGN_KEY_CHECKS = 0;

-- 1. ELIMINACIÓN DE TABLAS
DROP TABLE IF EXISTS `citas`;
DROP TABLE IF EXISTS `lookbooks_compartidos`;
DROP TABLE IF EXISTS `lookbooks`;
DROP TABLE IF EXISTS `productos_resenas`;
DROP TABLE IF EXISTS `productos_stock`;
DROP TABLE IF EXISTS `pedidos`;
DROP TABLE IF EXISTS `productos`;
DROP TABLE IF EXISTS `usuarios`;

-- 2. CREACIÓN DE TABLAS

-- Tabla de Usuarios
CREATE TABLE IF NOT EXISTS `usuarios` (
    `id` INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    `nombre_completo` VARCHAR(100) NOT NULL,
    `email` VARCHAR(100) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `foto_perfil` VARCHAR(255) DEFAULT 'assets/images/usuarios/default-avatar.png',
    `rol` ENUM('cliente', 'admin') DEFAULT 'cliente' NOT NULL,
    `fecha_registro` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Productos (Ahora incluye la columna 'imagenes' en JSON)
CREATE TABLE IF NOT EXISTS `productos` (
    `id` INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `descripcion` VARCHAR(450),
    `precio` DECIMAL(10, 2) NOT NULL,
    `descuento` VARCHAR(20) DEFAULT NULL,
    `categoria` VARCHAR(50) NOT NULL,
    `subcategoria` VARCHAR(50) NOT NULL,
    `modelo` VARCHAR(50) NOT NULL,
    `detalle` VARCHAR(50) DEFAULT '',
    `variante_destacada` BOOLEAN NOT NULL DEFAULT FALSE,
    `imagen_portada` VARCHAR(255) DEFAULT '1.png',
    `imagenes` JSON DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Stock (Exclusiva para control de inventario y talles)
CREATE TABLE IF NOT EXISTS `productos_stock` (
    `id` INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    `producto_id` INT UNSIGNED NOT NULL,
    `talle` VARCHAR(20) DEFAULT 'Único',
    `stock` INT NOT NULL DEFAULT 0,
    FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Reseñas
CREATE TABLE IF NOT EXISTS `productos_resenas` (
    `id` INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    `producto_id` INT UNSIGNED NOT NULL,
    `usuario_id` INT UNSIGNED NOT NULL,
    `calificacion` TINYINT UNSIGNED NOT NULL CHECK (`calificacion` BETWEEN 1 AND 5),
    `comentario` TEXT,
    `compra_verificada` BOOLEAN DEFAULT FALSE,
    `imagen_opcional` VARCHAR(255) DEFAULT NULL,
    `fecha_creacion` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `fecha_actualizacion` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Pedidos
CREATE TABLE IF NOT EXISTS `pedidos` (
    `id` INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    `usuario_id` INT UNSIGNED NOT NULL,
    `tipo_pedido` ENUM('venta_estandar', 'sastreria_medida') DEFAULT 'venta_estandar' NOT NULL,
    `detalles` TEXT NOT NULL,
    `total` DECIMAL(10, 2) NOT NULL,
    `estado` ENUM('pendiente', 'pagado', 'en proceso', 'listo', 'enviado', 'reembolsado', 'cancelado') DEFAULT 'pendiente',
    `fecha_pedido` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Lookbooks
-- composicion: JSON con [{ruta, w, h}] en el orden del álbum.
--   w = ancho en cuartos (1 = 25% ... 4 = 100%), h = alto en filas.
--   No guarda posiciones: el frontend arma la grilla según la pantalla (4, 3 o 2 columnas).
-- imagen_inspiracion: portada (la primera foto). La calcula la API sola al guardar.
CREATE TABLE IF NOT EXISTS `lookbooks` (
    `id` INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    `usuario_creador_id` INT UNSIGNED NOT NULL,
    `titulo` VARCHAR(100) NOT NULL,
    `imagen_inspiracion` VARCHAR(255) DEFAULT NULL,
    `composicion` JSON DEFAULT NULL,
    `notas_medidas` TEXT,
    `publico` BOOLEAN NOT NULL DEFAULT FALSE,
    `fecha_creacion` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `fecha_actualizacion` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`usuario_creador_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
 
-- Tabla de Lookbooks Compartidos
-- El UNIQUE impide compartir el mismo lookbook dos veces con la misma persona.
CREATE TABLE IF NOT EXISTS `lookbooks_compartidos` (
    `id` INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    `lookbook_id` INT UNSIGNED NOT NULL,
    `usuario_emisor_id` INT UNSIGNED NOT NULL,
    `usuario_receptor_id` INT UNSIGNED NOT NULL,
    `fecha_compartido` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `compartido_unico` (`lookbook_id`, `usuario_receptor_id`),
    FOREIGN KEY (`lookbook_id`) REFERENCES `lookbooks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (`usuario_emisor_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (`usuario_receptor_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `citas` (
    `id` INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    `usuario_id` INT UNSIGNED DEFAULT NULL,
    `nombre_contacto` VARCHAR(100) NOT NULL,
    `email_contacto` VARCHAR(100) NOT NULL,
    `telefono_contacto` VARCHAR(30) NOT NULL,
    `tipo` ENUM('visita', 'sastreria_medida') NOT NULL DEFAULT 'visita',
    `fecha` DATE NOT NULL,
    `hora` TIME NOT NULL,
    `aclaraciones` TEXT,
    `estado` ENUM('reservada', 'confirmada', 'finalizada', 'cancelada', 'ausente', 'bloqueada') DEFAULT 'reservada',
    `fecha_creacion` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `turno_unico` (`fecha`, `hora`),
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 3. INSERCIÓN DE DATOS DE PRUEBA

-- Insertar Usuarios (Password: secret)
INSERT INTO `usuarios` (`id`, `nombre_completo`, `email`, `password`, `rol`) VALUES
(1, 'Admin Gentleman', 'admin@somosgentleman.com', '$2y$10$TKh8H1.PfQx37YgCzwiKb.KjNyWgaHb9cbcoQgdIVFlYg7B77UdFm', 'admin'),
(2, 'Cliente Elegante', 'cliente@email.com', '$2y$10$TKh8H1.PfQx37YgCzwiKb.KjNyWgaHb9cbcoQgdIVFlYg7B77UdFm', 'cliente'),
(3, 'Padrino Boda', 'padrino@email.com', '$2y$10$TKh8H1.PfQx37YgCzwiKb.KjNyWgaHb9cbcoQgdIVFlYg7B77UdFm', 'cliente');

-- Insertar Productos (Con imagen_portada e imagenes JSON)
INSERT INTO `productos` (`id`, `nombre`, `descripcion`, `precio`, `descuento`, `categoria`, `subcategoria`, `modelo`, `detalle`, `variante_destacada`, `imagen_portada`, `imagenes`) VALUES
(1, 'Borcego Hudson', 'Elegancia urbana y confort absoluto.', 140000.00, '-10000', 'zapatos', 'borcego', 'hudson', '', TRUE, '1.png', '["1.png", "2.png", "3.png", "4.png"]'),
(2, 'Mocasin Jean', 'Un toque moderno, disruptivo y casual.', 135000.00, '-20000', 'zapatos', 'mocasin', 'jean', '', TRUE, '1.png', '["1.png", "2.png", "3.png", "4.png"]'),
(3, 'Botinetas Chelsea Suela', 'Botinetas clásicas con elástico en tono suela.', 150000.00, NULL, 'zapatos', 'botineta', 'chelsea', 'suela', FALSE, '1.png', '["1.png", "2.png", "3.png", "4.png"]'),
(4, 'Botinetas Chelsea Choco', 'Botinetas clásicas con elástico en tono chocolate.', 150000.00, NULL, 'zapatos', 'botineta', 'chelsea', 'choco', FALSE, '1.png', '["1.png", "2.png", "3.png", "4.png", "5.png"]'),
(5, 'Botinetas Chelsea Negro', 'Botinetas clásicas en tono negro puro.', 150000.00, NULL, 'zapatos', 'botineta', 'chelsea', 'negro', TRUE, '1.png', '["1.png", "2.png", "3.png", "4.png", "5.png", "6.jpg"]'),
(6, 'Zapato Oxford Suela', 'Calzado formal de cordones en tono suela.', 180000.00, NULL, 'zapatos', 'zapato', 'oxford', 'suela', FALSE, '1.png', '["1.png", "2.png", "3.png", "4.png"]'),
(7, 'Zapato Oxford Negro', 'Calzado formal de cordones en negro absoluto.', 180000.00, NULL, 'zapatos', 'zapato', 'oxford', 'negro', TRUE, '1.png', '["1.png", "2.png", "3.png", "4.png", "5.png"]'),
(8, 'Saco Pana Azul', 'Saco de pana premium, ideal para destacar.', 350000.00, '20%', 'sacos', '', 'pana', 'azul', TRUE, '1.jpg', '["1.jpg","2.jpg","3.jpg"]'),
(9, 'Trench Coat', 'Sobretodo clásico para media estación.', 450000.00, NULL, 'sacos', '', 'trench', '', TRUE, '1.jpg', '["1.jpg","2.jpg","3.jpg"]'),
(10, 'Camisa Lisa Blanca', 'Camisa entallada de algodón premium.', 70000.00, '15%', 'camisas', '', 'lisa', 'blanca', TRUE, '1.jpg', '["1.jpg", "2.jpg", "3.jpg", "4.jpg"]');
-- Insertar Stock
INSERT INTO `productos_stock` (`producto_id`, `talle`, `stock`) VALUES
(5, '39', 2), (5, '40', 5), (5, '41', 3), (5, '42', 8),
(8, 'S', 2), (8, 'M', 4), (8, 'L', 1),
(10, 'S', 10), (10, 'M', 15), (10, 'L', 8), (10, 'XL', 4),
(1, '43', 3), (2, '39', 5), (3, '41', 7),
(4, '43', 4), (6, '39', 2), (7, '42', 8), (9, 'L', 5);

-- Insertar Reseñas
INSERT INTO `productos_resenas` (`producto_id`, `usuario_id`, `calificacion`, `comentario`, `compra_verificada`) VALUES
(5, 2, 5, 'Excelente cuero, actitud total.', TRUE),
(8, 3, 4, 'El color azul resalta increíble en persona.', FALSE);

-- Insertar Pedidos
-- NOTA: 'detalles' es una lista de ids de productos_stock separados por '####'.
-- Cada número YA identifica producto + talle (id=2 -> producto 5, talle 40; id=9 -> producto 10, talle M).
INSERT INTO `pedidos` (`usuario_id`, `tipo_pedido`, `detalles`, `total`, `estado`) VALUES
(2, 'venta_estandar', '2####9', 220000.00, 'en proceso'),
(3, 'sastreria_medida', '8', 380000.00, 'pendiente');

-- Insertar Lookbooks
-- Usan fotos del catálogo para que se vean sin tener que subir nada.
-- 1: privado, el ejemplo de la vertical a la izquierda + dos apaisadas a la derecha (vertical 25% x 2 filas, apaisadas 50% x 1)
-- 2 y 3: públicos, aparecen en la galería
INSERT INTO `lookbooks` (`id`, `usuario_creador_id`, `titulo`, `imagen_inspiracion`, `composicion`, `notas_medidas`, `publico`) VALUES
(1, 2, 'Inspiración Casamiento', 'assets/images/productos/zapatos/chelsea/negro/1.png',
 '[{"ruta":"assets/images/productos/zapatos/chelsea/negro/1.png","w":1,"h":2},{"ruta":"assets/images/productos/sacos/pana/azul/1.jpg","w":2,"h":1},{"ruta":"assets/images/productos/camisas/lisa/blanca/1.jpg","w":2,"h":1}]',
 'Hombro 46cm, quiero combinar con el Chelsea Negro.', FALSE),
(2, 3, 'Padrino de noche', 'assets/images/productos/sacos/pana/azul/2.jpg',
 '[{"ruta":"assets/images/productos/sacos/pana/azul/2.jpg","w":2,"h":2},{"ruta":"assets/images/productos/zapatos/chelsea/negro/2.png","w":1,"h":1},{"ruta":"assets/images/productos/zapatos/chelsea/negro/3.png","w":1,"h":1},{"ruta":"assets/images/productos/camisas/lisa/blanca/2.jpg","w":2,"h":1}]',
 'Saco 50, pantalón 44.', TRUE),
(3, 2, 'Otoño en pana', 'assets/images/productos/sacos/pana/azul/3.jpg',
 '[{"ruta":"assets/images/productos/sacos/pana/azul/3.jpg","w":2,"h":2},{"ruta":"assets/images/productos/zapatos/oxford/negro/1.png","w":1,"h":1},{"ruta":"assets/images/productos/zapatos/chelsea/choco/1.png","w":1,"h":1},{"ruta":"assets/images/productos/camisas/lisa/blanca/1.jpg","w":2,"h":1}]',
 NULL, TRUE);
 
-- El cliente (2) le comparte su lookbook privado al padrino (3)
INSERT INTO `lookbooks_compartidos` (`lookbook_id`, `usuario_emisor_id`, `usuario_receptor_id`) VALUES
(1, 2, 3);


-- Insertar Citas de prueba
-- Las fechas se calculan a partir del día en que se corre el script:
-- "CURDATE() + INTERVAL 2 DAY" significa "hoy + 2 días". Así los datos de
-- prueba nunca quedan en el pasado, sin importar cuándo se restablezca la base.
INSERT INTO `citas` (`usuario_id`, `nombre_contacto`, `email_contacto`, `telefono_contacto`, `tipo`, `fecha`, `hora`, `aclaraciones`, `estado`) VALUES
-- Pasado mañana a las 10: sastrería confirmada (el admin ya habló con el cliente)
(2, 'Cliente Elegante', 'cliente@email.com', '1122334455', 'sastreria_medida', CURDATE() + INTERVAL 2 DAY, '10:00:00', 'Vengo para arreglarme para un casamiento.', 'confirmada'),
-- Pasado mañana a las 15: visita reservada, pendiente de confirmar
(3, 'Padrino Boda', 'padrino@email.com', '1199887766', 'visita', CURDATE() + INTERVAL 2 DAY, '15:00:00', NULL, 'reservada'),
-- Dentro de 3 días, 9 y 10 hs: bloqueados por el dueño (no son clientes)
(NULL, 'Administración', 'admin@somosgentleman.com', '-', 'visita', CURDATE() + INTERVAL 3 DAY, '09:00:00', 'Inventario mensual', 'bloqueada'),
(NULL, 'Administración', 'admin@somosgentleman.com', '-', 'visita', CURDATE() + INTERVAL 3 DAY, '10:00:00', 'Inventario mensual', 'bloqueada');

-- Rehabilitar la restricción de claves foráneas
SET FOREIGN_KEY_CHECKS = 1;