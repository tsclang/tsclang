#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscAsyncMutex mutex = tsc_async_mutex_create();
    printf("%s\n", tsc_async_mutex_is_locked(&mutex) ? "true" : "false");
    const bool locked = tsc_async_mutex_try_lock(&mutex);
    printf("%s\n", (locked) ? "true" : "false");
    printf("%s\n", tsc_async_mutex_is_locked(&mutex) ? "true" : "false");
    tsc_async_mutex_unlock(&mutex);
    printf("%s\n", tsc_async_mutex_is_locked(&mutex) ? "true" : "false");
    return 0;
}
