# google 图块参数

- https://stackoverflow.com/questions/23017766/google-maps-tile-url-for-hybrid-maptype-tiles
- https://blog.csdn.net/qq_35096696/article/details/106925709


经过搜览网上文章和自己探索。现将已确定的谷歌地图url参数记录如下。

eg: http://mt2.google.cn/vt/lyrs=m&scale=2&hl=zh-CN&gl=cn&x=6891&y=3040&z=13

几个子域名：mt0,mt1,mt2,mt3

lyrs = m 路线图
    s 卫星图
    y 带标签卫星图
    t 地形图
    p 带标签地形图
    h 标签层

scale =    1    256*256 px
    2     512*512
    3    768*768
    4    124*1024

gl=cn    加上是GCJ-02

hl=zh-CN    不知


高清带国内线路标记的地图：
https://www.google.cn/maps/vt?lyrs=s,h@900000000&hl=zh-CN&gl=CN&src=app&x={x}&y={y}&z={z}&s={$Galileo}&scale=2

lyrs=s,h@900000000 会显示中国路网，但数据是旧的

标清不带线路标记的地图：
https://www.google.cn/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}