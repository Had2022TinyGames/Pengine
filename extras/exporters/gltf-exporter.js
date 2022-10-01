const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

const getIndexComponentType = (indexFormat) => {
    switch (indexFormat) {
        case pc.INDEXFORMAT_UINT8: return 5121;
        case pc.INDEXFORMAT_UINT16: return 5123;
        case pc.INDEXFORMAT_UINT32: return 5125;
    }
    return 0;
};

const getComponentType = (dataType) => {
    switch (dataType) {
        case pc.TYPE_INT8: return 5120;
        case pc.TYPE_UINT8: return 5121;
        case pc.TYPE_INT16: return 5122;
        case pc.TYPE_UINT16: return 5123;
        case pc.TYPE_INT32: return 5124;
        case pc.TYPE_UINT32: return 5125;
        case pc.TYPE_FLOAT32: return 5126;
    }
    return 0;
};

const getAccessorType = (componentCount) => {
    switch (componentCount) {
        case 1: return 'SCALAR';
        case 2: return 'VEC2';
        case 3: return 'VEC3';
        case 4: return 'VEC4';
    }
    return 0;
};

const getSemantic = (engineSemantic) => {
    switch (engineSemantic) {
        case pc.SEMANTIC_POSITION: return 'POSITION';
        case pc.SEMANTIC_NORMAL: return 'NORMAL';
        case pc.SEMANTIC_TANGENT: return 'TANGENT';
        case pc.SEMANTIC_COLOR: return 'COLOR_0';
        case pc.SEMANTIC_BLENDINDICES: return 'JOINTS_0';
        case pc.SEMANTIC_BLENDWEIGHT: return 'WEIGHTS_0';
        case pc.SEMANTIC_TEXCOORD0: return 'TEXCOORD_0';
        case pc.SEMANTIC_TEXCOORD1: return 'TEXCOORD_1';
        case pc.SEMANTIC_TEXCOORD2: return 'TEXCOORD_2';
        case pc.SEMANTIC_TEXCOORD3: return 'TEXCOORD_3';
        case pc.SEMANTIC_TEXCOORD4: return 'TEXCOORD_4';
        case pc.SEMANTIC_TEXCOORD5: return 'TEXCOORD_5';
        case pc.SEMANTIC_TEXCOORD6: return 'TEXCOORD_6';
        case pc.SEMANTIC_TEXCOORD7: return 'TEXCOORD_7';
    }
};

class GltfExporter {
    collectResources(root) {
        const resources = {
            buffers: [],
            cameras: [],
            entities: [],
            materials: [],
            meshInstances: []
        };

        const { materials, buffers } = resources;

        // Collect entities
        root.forEach((entity) => {
            resources.entities.push(entity);
        });

        // Collect materials
        const collectMeshInstances = (meshInstances) => {
            meshInstances.forEach((meshInstance) => {

                // Collect material
                const material = meshInstance.material;
                if (materials.indexOf(material) < 0) {
                    resources.materials.push(material);
                }

                // Collect mesh instance
                resources.meshInstances.push(meshInstance);

                // Collect buffers
                const mesh = meshInstance.mesh;
                const vertexBuffer = mesh.vertexBuffer;
                if (buffers.indexOf(vertexBuffer) < 0) {
                    buffers.unshift(vertexBuffer);
                }

                const indexBuffer = mesh.indexBuffer[0];
                if (buffers.indexOf(indexBuffer) < 0) {
                    buffers.push(indexBuffer);
                }
            });
        };

        resources.entities.forEach((entity) => {
            if (entity.camera) {
                resources.cameras.push(entity.camera);
            }

            if (entity.render) {
                collectMeshInstances(entity.render.meshInstances);
            }

            if (entity.model) {
                collectMeshInstances(entity.model.meshInstances);
            }
        });

        return resources;
    }

    writeBuffers(resources, json) {
        if (resources.buffers.length > 0) {
            json.buffers = [];

            let byteLength = 0;

            resources.buffers.forEach((buffer) => {
                const arrayBuffer = buffer.lock();
                byteLength += arrayBuffer.byteLength;
            });

            const buffer = {
                byteLength: byteLength
            };

            json.buffers.push(buffer);
        }
    }

    writeBufferViews(resources, json) {
        if (resources.buffers.length > 0) {
            let offset = 0;

            json.bufferViews = resources.buffers.map((buffer) => {
                const arrayBuffer = buffer.lock();

                const bufferView = {
                    buffer: 0,
                    byteLength: arrayBuffer.byteLength,
                    byteOffset: offset
                };

                if (buffer instanceof pc.VertexBuffer) {
                    bufferView.target = ARRAY_BUFFER;
                    const format = buffer.getFormat();

                    if (format.interleaved) {
                        bufferView.byteStride = format.size;
                    }
                } else {
                    bufferView.target = ELEMENT_ARRAY_BUFFER;
                }

                offset += arrayBuffer.byteLength;

                return bufferView;
            });
        }
    }

    writeCameras(resources, json) {
        if (resources.cameras.length > 0) {
            json.cameras = resources.cameras.map((cam) => {
                const projection = cam.projection;
                const nearClip = cam.nearClip;
                const farClip = cam.farClip;

                const camera = {};

                if (projection === pc.PROJECTION_ORTHOGRAPHIC) {
                    camera.type = "orthographic";
                    camera.orthographic = {
                        xmag: 1,
                        ymag: 1,
                        znear: nearClip,
                        zfar: farClip
                    };
                } else {
                    const fov = cam.fov;

                    camera.type = "perspective";
                    camera.perspective = {
                        yfov: fov * Math.PI / 180,
                        znear: nearClip,
                        zfar: farClip
                    };
                }

                return camera;
            });
        }
    }

    writeMaterials(resources, json) {
        if (resources.materials.length > 0) {
            json.materials = resources.materials.map((mat) => {
                const { name, diffuse, emissive, opacity, blendType, cull } = mat;
                const material = {};

                if (name && name.length > 0) {
                    material.name = name;
                }

                if (!diffuse.equals(pc.Color.WHITE) || opacity !== 1) {
                    material.pbrMetallicRoughness = {};
                    material.pbrMetallicRoughness.baseColorFactor = [diffuse.r, diffuse.g, diffuse.b, opacity];
                }

                if (!emissive.equals(pc.Color.BLACK)) {
                    material.emissiveFactor = [emissive.r, emissive.g, emissive.b];
                }

                if (blendType === pc.BLEND_NORMAL) {
                    material.alphaMode = "BLEND";
                }

                if (cull === pc.CULLFACE_NONE) {
                    material.doubleSided = true;
                }

                return material;
            });
        }
    }

    writeNodes(resources, json) {
        if (resources.entities.length > 0) {
            json.nodes = resources.entities.map((entity) => {
                const name = entity.name;
                const t = entity.getLocalPosition();
                const r = entity.getLocalRotation();
                const s = entity.getLocalScale();

                const node = {};

                if (name && name.length > 0) {
                    node.name = name;
                }

                if (!t.equals(pc.Vec3.ZERO)) {
                    node.translation = [t.x, t.y, t.z];
                }

                if (!r.equals(pc.Quat.IDENTITY)) {
                    node.rotation = [r.x, r.y, r.z, r.w];
                }

                if (!s.equals(pc.Vec3.ONE)) {
                    node.scale = [s.x, s.y, s.z];
                }

                if (entity.camera && entity.camera.enabled) {
                    node.camera = resources.cameras.indexOf(entity.camera);
                }

                if (entity.render && entity.render.enabled) {
                    entity.render.meshInstances.forEach((meshInstance) => {
                        node.mesh = resources.meshInstances.indexOf(meshInstance);
                    });
                }

                if (entity.model && entity.model.enabled) {
                    entity.model.meshInstances.forEach((meshInstance) => {
                        node.mesh = resources.meshInstances.indexOf(meshInstance);
                    });
                }
                if (entity.children.length > 0) {
                    node.children = [];

                    entity.children.forEach((child) => {
                        node.children.push(resources.entities.indexOf(child));
                    });
                }

                return node;
            });
        }
    }

    writeMeshes(resources, json) {
        if (resources.meshInstances.length > 0) {
            json.accessors = [];
            json.meshes = [];

            resources.meshInstances.forEach((meshInstance) => {
                const indexBuffer = meshInstance.mesh.indexBuffer[0];
                const vertexBuffer = meshInstance.mesh.vertexBuffer;
                const vertexFormat = vertexBuffer.getFormat();
                const numVertices = vertexBuffer.getNumVertices();

                const mesh = {
                    primitives: []
                };
                const primitive = {
                    attributes: {},
                    material: resources.materials.indexOf(meshInstance.material)
                };

                // An accessor is a vertex attribute
                const writeAccessor = (element) => {

                    const accessor = {
                        bufferView: resources.buffers.indexOf(vertexBuffer),
                        byteOffset: element.offset,
                        componentType: getComponentType(element.dataType),
                        type: getAccessorType(element.numComponents),
                        count: numVertices
                    };

                    const idx = json.accessors.length;
                    json.accessors.push(accessor);

                    const semantic = getSemantic(element.name);
                    primitive.attributes[semantic] = idx;

                    // Position accessor also requires min and max properties
                    if (element.name === pc.SEMANTIC_POSITION) {

                        // compute min and max from positions, as the BoundingBox stores center and extents,
                        // and we get precision warnings from gltf validator
                        const positions = [];
                        meshInstance.mesh.getPositions(positions);
                        const min = new pc.Vec3(), max = new pc.Vec3();
                        pc.BoundingBox.computeMinMax(positions, min, max);

                        accessor.min = [min.x, min.y, min.z];
                        accessor.max = [max.x, max.y, max.z];
                    }
                };

                vertexFormat.elements.forEach(writeAccessor);

                if (indexBuffer) {
                    const ibIdx = resources.buffers.indexOf(indexBuffer);

                    const accessor = {
                        bufferView: ibIdx,
                        componentType: getIndexComponentType(indexBuffer.getFormat()),
                        count: indexBuffer.getNumIndices(),
                        type: "SCALAR"
                    };

                    json.accessors.push(accessor);

                    const idx = json.accessors.indexOf(accessor);

                    primitive.indices = idx;
                }

                mesh.primitives.push(primitive);

                json.meshes.push(mesh);
            });
        }
    }

    buildJson(resources) {
        const json = {
            asset: {
                version: "2.0",
                generator: "PlayCanvas GltfExporter"
            },
            scenes: [
                {
                    nodes: [
                        0
                    ]
                }
            ],
            scene: 0
        };

        this.writeBuffers(resources, json);
        this.writeBufferViews(resources, json);
        this.writeCameras(resources, json);
        this.writeNodes(resources, json);
        this.writeMaterials(resources, json);
        this.writeMeshes(resources, json);

        return json;
    }

    build(entity) {
        const resources = this.collectResources(entity);

        const json = this.buildJson(resources);
        const jsonText = JSON.stringify(json);

        const headerLength = 12;

        const jsonHeaderLength = 8;
        const jsonDataLength = jsonText.length;
        const jsonPaddingLength = (4 - (jsonDataLength & 3)) & 3;

        const binaryHeaderLength = 8;
        let binaryDataLength = 0;
        resources.buffers.forEach((buffer) => {
            binaryDataLength += buffer.lock().byteLength;
        });
        binaryDataLength = pc.math.roundUp(binaryDataLength, 4);

        let totalLength = headerLength + jsonHeaderLength + jsonDataLength + jsonPaddingLength;
        if (binaryDataLength > 0) {
            totalLength += binaryHeaderLength + binaryDataLength;
        }

        const glbBuffer = new ArrayBuffer(totalLength);
        const glbView = new DataView(glbBuffer);

        // GLB header
        glbView.setUint32(0, 0x46546C67, true);
        glbView.setUint32(4, 2, true);
        glbView.setUint32(8, totalLength, true);

        // JSON chunk header
        glbView.setUint32(12, jsonDataLength + jsonPaddingLength, true);
        glbView.setUint32(16, 0x4E4F534A, true);

        let offset = headerLength + jsonHeaderLength;

        // JSON data
        for (let i = 0; i < jsonDataLength; i++) {
            glbView.setUint8(offset + i, jsonText.charCodeAt(i));
        }

        offset += jsonDataLength;

        for (let i = 0; i < jsonPaddingLength; i++) {
            glbView.setUint8(offset + i, 0x20);
        }

        offset += jsonPaddingLength;

        if (binaryDataLength > 0) {
            // Binary chunk header
            glbView.setUint32(offset, binaryDataLength, true);
            glbView.setUint32(offset + 4, 0x004E4942, true);

            offset += binaryHeaderLength;

            resources.buffers.forEach((buffer) => {
                const srcBuffer = buffer.lock();
                let src;
                if (srcBuffer instanceof ArrayBuffer) {
                    src = new Uint8Array(srcBuffer);
                } else {
                    src = new Uint8Array(srcBuffer.buffer, srcBuffer.byteOffset, srcBuffer.byteLength);
                }
                const dst = new Uint8Array(glbBuffer, offset, srcBuffer.byteLength);
                dst.set(src);

                offset += srcBuffer.byteLength;
            });
        }

        return Promise.resolve(glbBuffer);
    }
}

export { GltfExporter };