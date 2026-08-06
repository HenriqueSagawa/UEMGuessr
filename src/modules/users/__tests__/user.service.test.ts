import { AppError } from "../../../utils/appError";
import { getProfile, updateProfile, updateAvatar, removeAvatar } from "../user.service";
import { prisma } from "../../../config/prisma";

jest.mock("../../../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("../../../lib/cloudinaryUpload", () => ({
  uploadAvatarImageBuffer: jest.fn(),
  deleteImage: jest.fn(),
}));

import { uploadAvatarImageBuffer, deleteImage } from "../../../lib/cloudinaryUpload";

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;
const mockUploadAvatar = uploadAvatarImageBuffer as jest.Mock;
const mockDeleteImage = deleteImage as jest.Mock;

const userRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "user-1",
  username: "henrique",
  email: "henrique@uem.com",
  password: "hashed:SenhaForte1",
  role: "USER",
  avatarUrl: null,
  avatarPublicId: null,
  displayName: null,
  bio: null,
  themeColor: null,
  emailVerified: true,
  createdAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFindUnique.mockReset();
  mockUpdate.mockReset();
  mockUploadAvatar.mockReset();
  mockDeleteImage.mockReset();
});

describe("getProfile", () => {
  it("lança 404 se o usuário não existe", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(getProfile("user-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("retorna o DTO do perfil sem a senha", async () => {
    mockFindUnique.mockResolvedValue(userRecord());

    const result = await getProfile("user-1");

    expect(result).toHaveProperty("username", "henrique");
    expect(result).not.toHaveProperty("password");
    expect(result).not.toHaveProperty("avatarPublicId");
  });
});

describe("updateProfile", () => {
  it("lança 404 se o usuário não existe", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(updateProfile("user-1", { displayName: "Henrique" })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("lança 409 se o nome de usuário já está em uso", async () => {
    mockFindUnique
      .mockResolvedValueOnce(userRecord())
      .mockResolvedValueOnce(userRecord({ id: "user-2", username: "joao" }));

    await expect(updateProfile("user-1", { username: "joao" })).rejects.toMatchObject({
      statusCode: 409,
      message: "Este nome de usuário já está em uso.",
    });
  });

  it("atualiza apenas os campos informados", async () => {
    mockFindUnique.mockResolvedValue(userRecord());
    mockUpdate.mockResolvedValue(userRecord({ displayName: "Henrique Sagawa" }));

    const result = await updateProfile("user-1", { displayName: "Henrique Sagawa" });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { displayName: "Henrique Sagawa" },
    });
    expect(result.displayName).toBe("Henrique Sagawa");
  });
});

describe("updateAvatar", () => {
  it("lança 404 se o usuário não existe", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(updateAvatar("user-1", Buffer.from("img"))).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("faz upload do avatar, atualiza o usuário e apaga o avatar anterior", async () => {
    mockFindUnique.mockResolvedValue(userRecord({ avatarPublicId: "avatars/antigo" }));
    mockUploadAvatar.mockResolvedValue({ url: "http://img/avatar.jpg", publicId: "avatars/novo" });
    mockUpdate.mockResolvedValue(userRecord({ avatarUrl: "http://img/avatar.jpg", avatarPublicId: "avatars/novo" }));

    const result = await updateAvatar("user-1", Buffer.from("img"));

    expect(mockUploadAvatar).toHaveBeenCalledWith(Buffer.from("img"));
    expect(mockDeleteImage).toHaveBeenCalledWith("avatars/antigo");
    expect(result.avatarUrl).toBe("http://img/avatar.jpg");
  });

  it("remove o novo avatar se a atualização no banco falhar", async () => {
    mockFindUnique.mockResolvedValue(userRecord());
    mockUploadAvatar.mockResolvedValue({ url: "http://img/avatar.jpg", publicId: "avatars/novo" });
    mockUpdate.mockRejectedValue(new Error("db down"));

    await expect(updateAvatar("user-1", Buffer.from("img"))).rejects.toThrow("db down");
    expect(mockDeleteImage).toHaveBeenCalledWith("avatars/novo");
  });
});

describe("removeAvatar", () => {
  it("lança 404 se o usuário não existe", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(removeAvatar("user-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("apaga a imagem do Cloudinary e limpa o avatar", async () => {
    mockFindUnique.mockResolvedValue(userRecord({ avatarPublicId: "avatars/antigo" }));
    mockUpdate.mockResolvedValue(userRecord({ avatarUrl: null, avatarPublicId: null }));

    const result = await removeAvatar("user-1");

    expect(mockDeleteImage).toHaveBeenCalledWith("avatars/antigo");
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { avatarUrl: null, avatarPublicId: null },
    });
    expect(result.avatarUrl).toBeNull();
  });
});
