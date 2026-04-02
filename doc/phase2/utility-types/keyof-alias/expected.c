#include "runtime.h"

typedef struct { String name; int32_t age; } User;
typedef enum { UserKey_name, UserKey_age } UserKey;
static const char *UserKey_values[] = { "name", "age" };

int main(void) {
    TSC_INIT();
    UserKey k = UserKey_name;
    printf("%s\n", UserKey_values[(int)k]);
    return 0;
}
