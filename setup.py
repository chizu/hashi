from setuptools import setup
setup(
    name="hashi",
    packages=["hashi"],
    version="0.0",
    description="Web centric IRC client.",
    author="Nell Hardcastle",
    author_email="chizu@spicious.com",
    install_requires=["pyzmq>=2.1.7",
                      "txzmq",
                      "txWebSocket",
                      "unicode_nazi",
                      "twisted"]
)
