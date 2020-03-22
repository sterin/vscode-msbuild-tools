from setuptools import setup

setup(
    name="msbuild_tools",
    py_modules=["msbuild_tools"],
    entry_points={
        'console_scripts': [
            'msbuild_tools = msbuild_tools:cli',
        ],
    }
)
