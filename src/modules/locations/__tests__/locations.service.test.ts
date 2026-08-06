import { AppError } from "../../../utils/appError";
import { createLocation, listLocations, getLocationById, updateLocation, deleteLocation } from "../locations.service";
import { prisma } from "../../../config/prisma";

jest.mock("../../../config/prisma", () => ({
  prisma: {
    location: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("../../../lib/cloudinaryUpload", () => ({
  uploadImageBuffer: jest.fn(),
  deleteImage: jest.fn(),
}));

import { uploadImageBuffer, deleteImage } from "../../../lib/cloudinaryUpload";

const mockCreate = prisma.location.create as jest.Mock;
const mockFindMany = prisma.location.findMany as jest.Mock;
const mockFindUnique = prisma.location.findUnique as jest.Mock;
const mockUpdate = prisma.location.update as jest.Mock;
const mockDelete = prisma.location.delete as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockUpload = uploadImageBuffer as jest.Mock;
const mockDeleteImage = deleteImage as jest.Mock;

const locationRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "loc-1",
  name: "Bloco H34",
  description: null,
  latitude: -23.4109,
  longitude: -51.9388,
  imageUrl: "http://img/loc-1.jpg",
  imagePublicId: "locations/loc-1",
  createdById: "user-1",
  createdAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockReset();
  mockFindMany.mockReset();
  mockFindUnique.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockTransaction.mockReset();
  mockUpload.mockReset();
  mockDeleteImage.mockReset();
});

describe("createLocation", () => {
  const input = { name: "Bloco H34", description: "Prédio", latitude: -23.4109, longitude: -51.9388 };

  it("faz upload da imagem e cria o local", async () => {
    mockUpload.mockResolvedValue({ url: "http://img/loc-1.jpg", publicId: "locations/loc-1" });
    mockCreate.mockResolvedValue(locationRecord());

    const result = await createLocation(input, Buffer.from("img"), "user-1");

    expect(mockUpload).toHaveBeenCalledWith(Buffer.from("img"));
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        name: "Bloco H34",
        description: "Prédio",
        latitude: -23.4109,
        longitude: -51.9388,
        imageUrl: "http://img/loc-1.jpg",
        imagePublicId: "locations/loc-1",
        createdById: "user-1",
      },
    });
    expect(result.id).toBe("loc-1");
  });

  it("remove a imagem do Cloudinary se a criação no banco falhar", async () => {
    mockUpload.mockResolvedValue({ url: "http://img/loc-1.jpg", publicId: "locations/loc-1" });
    mockCreate.mockRejectedValue(new Error("db down"));

    await expect(createLocation(input, Buffer.from("img"), "user-1")).rejects.toThrow("db down");
    expect(mockDeleteImage).toHaveBeenCalledWith("locations/loc-1");
  });
});

describe("listLocations", () => {
  it("retorna itens e paginação", async () => {
    mockTransaction.mockResolvedValue([[locationRecord()], 1]);

    const result = await listLocations({ page: 2, limit: 10 });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 1, totalPages: 1 });
  });

  it("calcula totalPages corretamente", async () => {
    mockTransaction.mockResolvedValue([[], 25]);

    const result = await listLocations({ page: 1, limit: 10 });

    expect(result.pagination.totalPages).toBe(3);
  });
});

describe("getLocationById", () => {
  it("lança 404 se o local não existe", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(getLocationById("loc-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Local não encontrado.",
    });
  });

  it("retorna o local", async () => {
    mockFindUnique.mockResolvedValue(locationRecord());

    const result = await getLocationById("loc-1");

    expect(result.id).toBe("loc-1");
  });
});

describe("updateLocation", () => {
  it("lança 404 se o local não existe", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(updateLocation("loc-1", { name: "Novo" }, null)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("atualiza os campos e mantém a imagem atual", async () => {
    mockFindUnique.mockResolvedValue(locationRecord());
    mockUpdate.mockResolvedValue(locationRecord({ name: "Novo Nome" }));

    const result = await updateLocation("loc-1", { name: "Novo Nome" }, null);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "loc-1" },
      data: expect.objectContaining({ name: "Novo Nome", imageUrl: "http://img/loc-1.jpg" }),
    });
    expect(mockDeleteImage).not.toHaveBeenCalled();
    expect(result.name).toBe("Novo Nome");
  });

  it("troca a imagem, faz upload da nova e apaga a anterior", async () => {
    mockFindUnique.mockResolvedValue(locationRecord());
    mockUpload.mockResolvedValue({ url: "http://img/nova.jpg", publicId: "locations/nova" });
    mockUpdate.mockResolvedValue(locationRecord({ imageUrl: "http://img/nova.jpg", imagePublicId: "locations/nova" }));

    await updateLocation("loc-1", { description: "Nova descrição" }, Buffer.from("nova-img"));

    expect(mockUpload).toHaveBeenCalledWith(Buffer.from("nova-img"));
    expect(mockDeleteImage).toHaveBeenCalledWith("locations/loc-1");
  });
});

describe("deleteLocation", () => {
  it("lança 404 se o local não existe", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(deleteLocation("loc-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lança 409 se o local já foi usado em partidas (P2003)", async () => {
    mockFindUnique.mockResolvedValue(locationRecord());
    mockDelete.mockRejectedValue({ code: "P2003" });

    await expect(deleteLocation("loc-1")).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("já foi usado em partidas"),
    });
  });

  it("apaga o local e a imagem do Cloudinary", async () => {
    mockFindUnique.mockResolvedValue(locationRecord());
    mockDelete.mockResolvedValue(locationRecord());

    await deleteLocation("loc-1");

    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "loc-1" } });
    expect(mockDeleteImage).toHaveBeenCalledWith("locations/loc-1");
  });
});
