#include "runtime.h"
#include "std/fs.h"

int main(void) {
    TSC_INIT();
    const TscFileStat info = tsc_fs_stat_sync(STR_LIT("./data.txt"));
    printf("%lld\n", (long long)info.size);
    return 0;
}
