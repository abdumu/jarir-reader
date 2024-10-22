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
                setupIcon: "./ui/images/jarir-logo.ico",
                iconUrl: "https://raw.githubusercontent.com/abdumu/jarir-reader/master/ui/images/jarir-logo.ico",
            },
        },
        {
            name: "@electron-forge/maker-dmg",
            config: {
                format: "ULFO",
                icon: "./ui/images/jarir-logo.png",
            },
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
    publishers: [
        {
            name: "@electron-forge/publisher-github",
            config: {
                repository: {
                    owner: "abdumu",
                    name: "jarir-reader",
                },
                draft: true,
            },
        },
    ],
};
