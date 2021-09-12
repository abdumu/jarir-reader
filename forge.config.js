module.exports = {
    packagerConfig: {},
    makers: [
        {
            name: "@electron-forge/maker-squirrel",
            config: {
                title: "قارئ جرير",
                name: "jarir-reader",
                genericName: "Jarir Reader",
                icon: "./ui/images/jarir-logo.ico",
            },
        },
        {
            name: "@electron-forge/maker-zip",
            platforms: ["darwin"],
        },
        {
            name: "@electron-forge/maker-deb",
            config: {
                productName: "قارئ جرير",
                name: "jarir-reader",
                genericName: "Jarir Reader",
                icon: "./ui/images/jarir-logo.png",
            },
        },
        {
            name: "@electron-forge/maker-rpm",
            config: {
                productName: "قارئ جرير",
                name: "jarir-reader",
                genericName: "Jarir Reader",
                icon: "./ui/images/jarir-logo.png",
            },
        },
    ],
    hooks: {},
};
