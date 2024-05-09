const { createController } = require("awilix-express");
const { generateSuccessResponse, generateErrorResponse } = require("../../utils/responseParser");
const errorMessages = require("../../errorMessages");
const { RefreshToken } = require("../../aggregate");
const { http } = require("winston");

const controller = ({ config, userRepository, refreshTokenRepository }) => {
    return {
        async regenerateToken(req, res) {
            try {
                const oldRefreshToken = req.cookies?.refreshToken;

                const [deleteRefreshTokenError, deleteRefreshToken] = oldRefreshToken
                    ? await refreshTokenRepository.deleteRefreshToken({ token: oldRefreshToken })
                    : [null, null];

                if (deleteRefreshTokenError) throw deleteRefreshTokenError;

                if (!deleteRefreshToken)
                    return res.status(400).send(generateErrorResponse(errorMessages.refreshTokenNotFound()));

                const userId = deleteRefreshToken.getUserId();

                const [userProfileError, userProfile] = await userRepository.get(userId);

                if (userProfileError) throw userProfileError;

                const { accessTokenSecret, accessTokenDurationInHour } = config.security;

                const { accessToken, accessTokenExpiredAt, fingerprint } = userProfile.generateToken(
                    accessTokenSecret,
                    accessTokenDurationInHour
                );

                const newRefreshTokenData = new RefreshToken({ userId });

                const [createRefreshTokenError, createRefreshToken] =
                    await refreshTokenRepository.createRefreshToken(newRefreshTokenData);

                if (createRefreshTokenError) throw createRefreshTokenError;

                let response = { accessToken };

                return res
                    .status(200)
                    .cookie("refreshToken", newRefreshTokenData.token, {
                        expires: newRefreshTokenData.expiredAt,
                        httpOnly: true
                    })
                    .cookie("fingerprint", fingerprint, { expires: accessTokenExpiredAt, httpOnly: true })
                    .send(generateSuccessResponse(response));
            } catch (err) {
                // console.log(err);
                return res
                    .status(500)
                    .clearCookie("refreshToken")
                    .clearCookie("fingerprint")
                    .send(generateErrorResponse());
            }
        }
    };
};

module.exports = createController(controller).prefix("/api").post("/users/token", "regenerateToken");
